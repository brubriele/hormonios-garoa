import { AppError, BookingClosedError, InvalidParameterError } from "../errors/app-error";
import type { Attendance, AttendanceSync } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { User } from "../models/user";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import type { UUID } from "../interfaces/uuid";
import { SendAttendanceUsecase } from "./send-attendance";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IReserveInput {
  email: string;
  name: string;
  pronoun: string;
  groupId: string | null; // null = só presença
  supportIds: string[];
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

      console.error("[ReserveUsecase]", error);
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
    if (typeof input.email !== "string" || !EMAIL_PATTERN.test(this.normalizeEmail(input.email))) {
      throw new InvalidParameterError("Field email is invalid");
    }

    if (typeof input.name !== "string" || input.name.trim() === "") {
      throw new InvalidParameterError("Field name is required");
    }

    if (typeof input.pronoun !== "string" || input.pronoun.trim() === "") {
      throw new InvalidParameterError("Field pronoun is required");
    }

    if (input.groupId !== null && (typeof input.groupId !== "string" || input.groupId.trim() === "")) {
      throw new InvalidParameterError("Field groupId is invalid");
    }

    if (!Array.isArray(input.supportIds) || input.supportIds.some((id) => typeof id !== "string")) {
      throw new InvalidParameterError("Field supportIds is invalid");
    }

    if (input.groupId === null && input.supportIds.length > 0) {
      throw new InvalidParameterError("Field supportIds must be empty without groupId");
    }
  }

  // minúsculas e sem espaços (R15)
  private normalizeEmail(email: string): string {
    return email.replace(/\s+/g, "").toLowerCase();
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
      email: this.normalizeEmail(input.email),
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

  // grava local primeiro (PENDING) e envia na hora. Recusou: a linha fica REJECTED e a rota responde
  // o erro traduzido. Fora ou lento: PENDING, o cron envia depois
  private async sendTransicionaisAttendance(
    attendance: Attendance,
    event: CurrentEvent,
    ip: string | null,
  ): Promise<AttendanceSync> {
    const outcome = await this.sendAttendance.execute({ attendance, event, ip });

    if (outcome.error) {
      throw outcome.error;
    }

    return outcome.sync;
  }
}
