import { AppError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import type { Attendance } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { EventView } from "../models/event-view";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import { EventViewMapper } from "./mappers/event-view.mapper";
import { RefreshCurrentEventUsecase } from "./refresh-current-event";

const MAX_AGE_MS = 5 * 60 * 1000;

const logger = createLogger("GetEventUsecase");

export class GetEventUsecase {
  private readonly refreshCurrentEvent: RefreshCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.refreshCurrentEvent = new RefreshCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(): Promise<EventView> {
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

  private async _execute(): Promise<EventView> {
    const cached = await this.hormoniosRepo.findCurrentEvent();

    if (cached && !this.needsRefresh(cached)) {
      return this.buildView(cached, false);
    }

    const available = await this.refreshTransicionaisEvent();
    const event = available || !cached ? await this.findSupabaseCurrentEvent() : cached;

    return this.buildView(event, !available);
  }

  private async buildView(event: CurrentEvent, stale: boolean): Promise<EventView> {
    const attendances = await this.findSupabaseAttendances(event.dayKey);

    return EventViewMapper.toView(event, attendances, stale);
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
      return (await this.refreshCurrentEvent.execute()).available;
    } catch {
      return false; // o RefreshCurrentEventUsecase já registrou
    }
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  private async findSupabaseAttendances(dayKey: string): Promise<Attendance[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }
}
