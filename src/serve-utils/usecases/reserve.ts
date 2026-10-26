import { z } from "zod";
import { AppError, BookingClosedError, InvalidParameterError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import type { Attendance, AttendanceSync } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import { NonBlankSchema, UuidSchema, validateSchema } from "../models/model-schema";
import type { User } from "../models/user";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import type { UUID } from "../interfaces/uuid";
import { SendAttendanceUsecase } from "./send-attendance";

const logger = createLogger("ReserveUsecase");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// minúsculas e sem espaços (R15)
function normalizeEmail(email: string): string {
  return email.replace(/\s+/g, "").toLowerCase();
}

const ReserveInputSchema = z
  .object({
    email: z.string().refine((email) => EMAIL_PATTERN.test(normalizeEmail(email))),
    name: NonBlankSchema,
    pronoun: NonBlankSchema,
    groupId: NonBlankSchema.nullable(), // null = só presença
    supportIds: z.array(z.string()),
    deviceId: UuidSchema,
    ip: z.string().nullable(),
  })
  .refine((input) => input.groupId !== null || input.supportIds.length === 0, {
    path: ["supportIds"],
    message: "must be empty without groupId",
  });

// o corpo do POST /api/reserva
export interface IReserveBody {
  email: string;
  name: string;
  pronoun: string;
  groupId: string | null; // null = só presença
  supportIds: string[];
}

export interface IReserveInput extends IReserveBody {
  deviceId: UUID;
  ip: string | null; // IP real (H11), repassado ao Transicionais
}

export interface IReservationView {
  id: UUID;
  groupId: string | null;
  supportIds: string[];
  name: string;
  pronoun: string;
  sync: AttendanceSync; // PENDING: fora do ar, lento ou retrato local; SYNCED: o Transicionais aceitou
}

export class ReserveUsecase {
  private readonly sendAttendance: SendAttendanceUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.sendAttendance = new SendAttendanceUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: IReserveInput): Promise<IReservationView> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IReserveInput): Promise<IReservationView> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent(input);
    const user = await this.upsertSupabaseUser(input);
    const attendance = await this.reserveSupabaseAttendance(input, event, user);
    const sync = await this.sendTransicionaisAttendance(attendance, event, input.ip);

    return {
      id: attendance.id,
      groupId: attendance.groupId,
      supportIds: attendance.supportIds,
      name: attendance.user.name,
      pronoun: attendance.user.pronoun,
      sync,
    };
  }

  private validateInput(input: IReserveInput) {
    validateSchema(ReserveInputSchema, input);
  }

  private async findSupabaseCurrentEvent(input: IReserveInput): Promise<CurrentEvent> {
    const event = await this.hormoniosRepo.findCurrentEventOrFail();

    this.validateBookingOpen(event);
    this.validateSupports(event, input.groupId, input.supportIds);

    return event;
  }

  // antes do upsert, para não trocar o nome com as reservas fechadas; a funcao SQL confere de novo
  private validateBookingOpen(event: CurrentEvent) {
    if (!event.bookingOpen) {
      throw new BookingClosedError("Booking is closed");
    }
  }

  // cada acessório precisa valer para o instrumento (E2.9); sem groupId, supportIds já está vazio
  private validateSupports(event: CurrentEvent, groupId: string | null, supportIds: string[]) {
    if (groupId === null) {
      return;
    }

    const known = new Set(event.supportsForGroup(groupId).map((support) => support.id));

    if (supportIds.some((id) => !known.has(id))) {
      throw new InvalidParameterError("Field supportIds is invalid");
    }
  }

  // sobrescreve nome e pronome do e-mail
  private async upsertSupabaseUser(input: IReserveInput): Promise<User> {
    return this.hormoniosRepo.upsertUserByEmail({
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      pronoun: input.pronoun.trim(),
    });
  }

  private async reserveSupabaseAttendance(input: IReserveInput, event: CurrentEvent, user: User): Promise<Attendance> {
    return this.hormoniosRepo.reserve({
      user,
      dayKey: event.dayKey,
      deviceId: input.deviceId,
      groupId: input.groupId,
      supportIds: [...new Set(input.supportIds)],
    });
  }

  // grava local primeiro (PENDING) e envia na hora. Qualquer falha, inclusive a recusa do Transicionais,
  // deixa a linha PENDING, e o cron envia depois (D44)
  private async sendTransicionaisAttendance(
    attendance: Attendance,
    event: CurrentEvent,
    ip: string | null,
  ): Promise<AttendanceSync> {
    const outcome = await this.sendAttendance.execute({ attendance, event, ip });

    return outcome.sync;
  }
}
