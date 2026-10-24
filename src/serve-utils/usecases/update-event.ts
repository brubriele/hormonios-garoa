import { AppError, InvalidParameterError, StockBelowReservationsError } from "../errors/app-error";
import type { Attendance } from "../models/attendance";
import { CurrentEvent, Group } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import { countReservedByGroup, toAdminSummary, type IAdminSummary } from "./event-summary";

export interface IUpdateEventGroupInput {
  id: string;
  stockTotal: number;
}

// parcial: só os campos enviados mudam
export interface IUpdateEventInput {
  date?: string;
  time?: string;
  location?: string;
  whatsappUrl?: string;
  bookingOpen?: boolean;
  groups?: IUpdateEventGroupInput[];
}

const TEXT_FIELDS = ["date", "time", "location", "whatsappUrl"] as const;

export class UpdateEventUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(input: IUpdateEventInput): Promise<IAdminSummary> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[UpdateEventUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IUpdateEventInput): Promise<IAdminSummary> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent(input);
    const attendances = await this.findSupabaseAttendances(event.dayKey);
    const updated = this.buildUpdatedEvent(event, input);

    this.validateStockAboveReservations(updated, attendances);

    const saved = await this.hormoniosRepo.saveCurrentEvent(updated);

    return toAdminSummary(saved, attendances);
  }

  private validateInput(input: IUpdateEventInput) {
    for (const field of TEXT_FIELDS) {
      if (input[field] !== undefined && typeof input[field] !== "string") {
        throw new InvalidParameterError(`Field ${field} is invalid`);
      }
    }

    if (input.bookingOpen !== undefined && typeof input.bookingOpen !== "boolean") {
      throw new InvalidParameterError("Field bookingOpen is invalid");
    }

    if (input.groups === undefined) {
      return;
    }

    if (!Array.isArray(input.groups)) {
      throw new InvalidParameterError("Field groups is invalid");
    }

    for (const group of input.groups) {
      if (typeof group?.id !== "string" || !Number.isInteger(group.stockTotal) || group.stockTotal < 0) {
        throw new InvalidParameterError("Field groups is invalid");
      }
    }
  }

  private async findSupabaseCurrentEvent(input: IUpdateEventInput): Promise<CurrentEvent> {
    const event = await this.hormoniosRepo.findCurrentEventOrFail();

    this.validateGroupsExist(event, input.groups ?? []);

    return event;
  }

  private validateGroupsExist(event: CurrentEvent, groups: IUpdateEventGroupInput[]) {
    const unknown = groups.find((group) => !event.findGroup(group.id));

    if (unknown) {
      throw new InvalidParameterError(`Field groups has unknown id ${unknown.id}`);
    }
  }

  private async findSupabaseAttendances(dayKey: string): Promise<Attendance[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }

  private buildUpdatedEvent(event: CurrentEvent, input: IUpdateEventInput): CurrentEvent {
    const stockById = new Map((input.groups ?? []).map((group) => [group.id, group.stockTotal]));

    return new CurrentEvent(
      event.dayKey,
      input.date ?? event.date,
      input.time ?? event.time,
      input.location?.trim() ?? event.location,
      input.bookingOpen ?? event.bookingOpen,
      input.whatsappUrl?.trim() ?? event.whatsappUrl,
      event.groups.map(
        (group) => new Group(group.id, group.name, stockById.get(group.id) ?? group.stockTotal, group.active),
      ),
      event.supports,
    );
  }

  private validateStockAboveReservations(event: CurrentEvent, attendances: Attendance[]) {
    const reserved = countReservedByGroup(attendances);
    const below = event.groups.find((group) => group.stockTotal < (reserved.get(group.id) ?? 0));

    if (below) {
      throw new StockBelowReservationsError(`Stock of ${below.id} is below its reservations`);
    }
  }
}
