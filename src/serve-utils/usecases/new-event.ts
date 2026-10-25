import { AppError, UpstreamUnavailableError } from "../errors/app-error";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { IEventRef, ITransicionaisRepo } from "../interfaces/transicionais";
import { toAdminSummary, type IAdminSummary } from "./event-summary";
import { RefreshCurrentEventUsecase } from "./refresh-current-event";

// "Encerrar ensaio" (E2.5): cria o próximo encontro no Transicionais, apaga o atual, e o novo passa a
// ser o primeiro Público da listagem (E2.7, revista)
export class NewEventUsecase {
  private readonly refreshCurrentEvent: RefreshCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.refreshCurrentEvent = new RefreshCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(): Promise<IAdminSummary> {
    try {
      return await this._execute(); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[NewEventUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  // ordem: cria o próximo, encerra o antigo e relê; a releitura acha o novo pela listagem (D2).
  // as linhas antigas ficam com o dayKey anterior; o WhatsApp continua o mesmo
  private async _execute(): Promise<IAdminSummary> {
    const event = await this.findSupabaseTransicionaisEvent();
    await this.createTransicionaisEvent(event);
    await this.closeTransicionaisEvent(event);
    await this.refreshSupabaseEvent();

    const saved = await this.hormoniosRepo.findCurrentEventOrFail();

    return toAdminSummary(saved, []); // ensaio novo: ainda sem presenças
  }

  // retrato local da fase 1: lê o Transicionais antes (e migra as reservas)
  private async findSupabaseTransicionaisEvent(): Promise<CurrentEvent> {
    const event = await this.hormoniosRepo.findCurrentEventOrFail();

    if (event.isFromTransicionais) {
      return event;
    }

    await this.refreshSupabaseEvent();

    const refreshed = await this.hormoniosRepo.findCurrentEventOrFail();

    if (!refreshed.isFromTransicionais) {
      throw new UpstreamUnavailableError("Transicionais event is not available");
    }

    return refreshed;
  }

  private async createTransicionaisEvent(event: CurrentEvent): Promise<IEventRef> {
    return this.transicionaisRepo.createNextEvent({ externalId: event.externalId ?? "", dayId: event.dayKey });
  }

  // o novo já é o atual: se o antigo não sair, só registra e segue (dúvida D13)
  private async closeTransicionaisEvent(event: CurrentEvent): Promise<void> {
    try {
      await this.transicionaisRepo.closeEvent({ externalId: event.externalId ?? "", dayId: event.dayKey });
    } catch (error) {
      console.error("[NewEventUsecase] closeEvent failed", error);
    }
  }

  private async refreshSupabaseEvent(): Promise<void> {
    const result = await this.refreshCurrentEvent.execute();

    if (!result.available) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }
  }
}
