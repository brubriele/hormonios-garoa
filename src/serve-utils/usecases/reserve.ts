import { AppError, BookingClosedError, InvalidParameterError } from "../errors/app-error";
import type { Attendance } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { User } from "../models/user";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { UUID } from "../interfaces/uuid";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IReserveInput {
  email: string;
  name: string;
  pronoun: string;
  groupId: string | null; // null = só presença
  supportIds: string[];
  deviceId: UUID;
}

export interface IReservationView {
  id: UUID;
  groupId: string | null;
  supportIds: string[];
  name: string;
  pronoun: string;
}

export class ReserveUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

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

    return {
      id: attendance.id,
      groupId: attendance.groupId,
      supportIds: attendance.supportIds,
      name: attendance.user.name,
      pronoun: attendance.user.pronoun,
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
    this.validateSupports(event, input.supportIds);

    return event;
  }

  // antes do upsert, para não trocar o nome com as reservas fechadas; a funcao SQL confere de novo
  private validateBookingOpen(event: CurrentEvent) {
    if (!event.bookingOpen) {
      throw new BookingClosedError("Booking is closed");
    }
  }

  private validateSupports(event: CurrentEvent, supportIds: string[]) {
    const known = new Set(event.supports.map((support) => support.id));

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
}
