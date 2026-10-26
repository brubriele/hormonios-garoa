import { AppError } from "../../errors/app-error";
import { createLogger } from "../../lib/logger";
import type { Booking } from "../../models/booking";
import type { CurrentEvent } from "../../models/current-event";
import type { PublicEvent } from "../../models/public-event";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { PublicEventMapper } from "./mappers/public-event.mapper";
import { ReceivingCurrentEventUsecase } from "../sync/receiving-current-event";

const MAX_AGE_MS = 5 * 60 * 1000;

const logger = createLogger("FindingCurrentEventUsecase");

export class FindingCurrentEventUsecase {
  private readonly receivingCurrentEvent: ReceivingCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.receivingCurrentEvent = new ReceivingCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(): Promise<PublicEvent> {
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

  private async _execute(): Promise<PublicEvent> {
    const cached = await this.hormoniosRepo.findCurrentEvent();

    if (cached && !this.needsRefresh(cached)) {
      return this.buildView(cached, false);
    }

    const available = await this.refreshTransicionaisEvent();
    const event = available || !cached ? await this.findSupabaseCurrentEvent() : cached;

    return this.buildView(event, !available);
  }

  private async buildView(event: CurrentEvent, stale: boolean): Promise<PublicEvent> {
    const bookings = await this.findSupabaseBookings(event.dayKey);

    return PublicEventMapper.toView(event, bookings, stale);
  }

  // retrato vazio, local da fase 1 ou com mais de 5 min
  private needsRefresh(event: CurrentEvent | null): boolean {
    if (!event || !event.isFromTransicionais || !event.fetchedAt) {
      return true;
    }

    return Date.now() - Date.parse(event.fetchedAt) > MAX_AGE_MS;
  }

  // true quando o Transicionais respondeu; qualquer falha deixa o último retrato
  private async refreshTransicionaisEvent(): Promise<boolean> {
    try {
      return (await this.receivingCurrentEvent.execute()).available;
    } catch {
      return false; // o ReceivingCurrentEventUsecase já registrou
    }
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  private async findSupabaseBookings(dayKey: string): Promise<Booking[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }
}
