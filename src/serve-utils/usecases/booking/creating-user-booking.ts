import { z } from "zod";
import { AppError, BookingClosedError, InvalidParameterError } from "../../errors/app-error";
import { createLogger } from "../../lib/logger";
import type { Booking, BookingSync } from "../../models/booking";
import type { CurrentEvent } from "../../models/current-event";
import { NonBlankSchema, UuidSchema, validateSchema } from "../../models/model-schema";
import type { User } from "../../models/user";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import type { UUID } from "../../interfaces/uuid";
import { SyncingUserBookingUsecase } from "../sync/syncing-user-booking";

const logger = createLogger("CreatingUserBookingUsecase");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// minúsculas e sem espaços (R15)
function normalizeEmail(email: string): string {
  return email.replace(/\s+/g, "").toLowerCase();
}

const CreatingUserBookingInputSchema = z
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
export interface ICreatingUserBookingBody {
  email: string;
  name: string;
  pronoun: string;
  groupId: string | null; // null = só presença
  supportIds: string[];
}

export interface ICreatingUserBookingInput extends ICreatingUserBookingBody {
  deviceId: UUID;
  ip: string | null; // IP real (H11), repassado ao Transicionais
}

export interface ICreatingUserBookingView {
  id: UUID;
  groupId: string | null;
  supportIds: string[];
  name: string;
  pronoun: string;
  sync: BookingSync; // PENDING: fora do ar, lento ou retrato local; SYNCED: o Transicionais aceitou
}

export class CreatingUserBookingUsecase {
  private readonly syncingUserBooking: SyncingUserBookingUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.syncingUserBooking = new SyncingUserBookingUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: ICreatingUserBookingInput): Promise<ICreatingUserBookingView> {
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

  private async _execute(input: ICreatingUserBookingInput): Promise<ICreatingUserBookingView> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent(input);
    const user = await this.upsertSupabaseUser(input);
    const booking = await this.createSupabaseBooking(input, event, user);
    const sync = await this.sendTransicionaisBooking(booking, event, input.ip);

    return {
      id: booking.id,
      groupId: booking.groupId,
      supportIds: booking.supportIds,
      name: booking.user.name,
      pronoun: booking.user.pronoun,
      sync,
    };
  }

  private validateInput(input: ICreatingUserBookingInput) {
    validateSchema(CreatingUserBookingInputSchema, input);
  }

  private async findSupabaseCurrentEvent(input: ICreatingUserBookingInput): Promise<CurrentEvent> {
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

    const known = new Set(event.accessoriesForInstrument(groupId).map((accessory) => accessory.id));

    if (supportIds.some((id) => !known.has(id))) {
      throw new InvalidParameterError("Field supportIds is invalid");
    }
  }

  // sobrescreve nome e pronome do e-mail
  private async upsertSupabaseUser(input: ICreatingUserBookingInput): Promise<User> {
    return this.hormoniosRepo.upsertUserByEmail({
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      pronoun: input.pronoun.trim(),
    });
  }

  private async createSupabaseBooking(input: ICreatingUserBookingInput, event: CurrentEvent, user: User): Promise<Booking> {
    return this.hormoniosRepo.createBooking({
      user,
      dayKey: event.dayKey,
      deviceId: input.deviceId,
      groupId: input.groupId,
      supportIds: [...new Set(input.supportIds)],
    });
  }

  // grava local primeiro (PENDING) e envia na hora. Qualquer falha, inclusive a recusa do Transicionais,
  // deixa a linha PENDING, e o cron envia depois (D44)
  private async sendTransicionaisBooking(
    booking: Booking,
    event: CurrentEvent,
    ip: string | null,
  ): Promise<BookingSync> {
    const outcome = await this.syncingUserBooking.execute({ booking, event, ip });

    return outcome.sync;
  }
}
