import { AppError } from "../../errors/app-error";
import { createLogger } from "../../lib/logger";
import type { CurrentEventSummary } from "../../models/current-event-summary";
import type { Booking } from "../../models/booking";
import type { CurrentEvent } from "../../models/current-event";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import { CurrentEventSummaryMapper } from "./mappers/current-event-summary.mapper";

const logger = createLogger("FindingCurrentEventSummaryUsecase");

export class FindingCurrentEventSummaryUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(): Promise<CurrentEventSummary> {
    try {
      return await this._execute(); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(): Promise<CurrentEventSummary> {
    const event = await this.findSupabaseCurrentEvent();
    const bookings = await this.findSupabaseBookings(event.dayKey);

    return CurrentEventSummaryMapper.toView(event, bookings);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  private async findSupabaseBookings(dayKey: string): Promise<Booking[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }
}
