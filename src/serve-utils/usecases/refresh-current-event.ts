import { AppError, UpstreamUnavailableError } from "../errors/app-error";
import { UpstreamBadContractError, UpstreamResponseError } from "../errors/infra-error";
import { today } from "../lib/date";
import { createLogger } from "../lib/logger";
import type { CurrentEvent } from "../models/current-event";
import type { EventSnapshot } from "../models/event-snapshot";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { IEventRef, ITransicionaisRepo } from "../interfaces/transicionais";

const logger = createLogger("RefreshCurrentEventUsecase");

export interface IRefreshCurrentEventResult {
  changed: boolean; // o retrato gravado mudou
  available: boolean; // false = o Transicionais não respondeu (ou o encontro não existe): o retrato ficou como estava
}

// refreshCurrentEvent() (R13, revista pela E2.7): o encontro atual é o primeiro Público da listagem
// de manager do Transicionais, de hoje em diante. Lê e grava o
// retrato com a trava. Usado por GET /api/ensaio, GET /api/cron/event e pelas ações da Produção.
export class RefreshCurrentEventUsecase {
  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(): Promise<IRefreshCurrentEventResult> {
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

  private async _execute(): Promise<IRefreshCurrentEventResult> {
    const current = await this.findSupabaseCurrentEvent();
    const snapshot = await this.findTransicionaisSnapshot();

    if (!snapshot) {
      return { changed: false, available: false }; // não mexe no retrato
    }

    if (current && !current.isFromTransicionais) {
      await this.migrateSupabaseAttendances(current, snapshot);
    }

    const changed = await this.hormoniosRepo.saveSnapshot(snapshot);

    return { changed, available: true };
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent | null> {
    return this.hormoniosRepo.findCurrentEvent();
  }

  // null = o encontro não existe ou o Transicionais está fora do ar (plano de falha: fica o retrato)
  private async findTransicionaisSnapshot(): Promise<EventSnapshot | null> {
    try {
      const ref = await this.findTransicionaisCurrentRef();

      return ref ? await this.findTransicionaisPublicEvent(ref) : null;
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return null;
      }

      await this.markSupabaseEventError(error);
      throw error;
    }
  }

  // o erro do Transicionais vai como veio para a linha do retrato; 400, 409 ou 422 também deixam
  // MANUAL_RETRY (D50). Uma falha ao gravar não esconde o erro da leitura
  private async markSupabaseEventError(error: unknown): Promise<void> {
    const manualRetry = error instanceof UpstreamBadContractError;
    const errorCause = manualRetry || error instanceof UpstreamResponseError ? error.errorCause : null;

    if (!errorCause) {
      return;
    }

    try {
      await this.hormoniosRepo.markEventError({ manualRetry, errorCause });
    } catch (markError) {
      logger.error({ err: markError }, "event error not saved (D50)");
    }
  }

  // o encontro atual é o primeiro Público da listagem, de hoje em diante (E2.7)
  private async findTransicionaisCurrentRef(): Promise<IEventRef | null> {
    const ref = (await this.transicionaisRepo.listPublicEventsFrom(today()))[0] ?? null;

    if (!ref) {
      logger.warn("no public Transicionais event from today on");
    }

    return ref;
  }

  private async findTransicionaisPublicEvent(ref: IEventRef): Promise<EventSnapshot | null> {
    const snapshot = await this.transicionaisRepo.findPublicEvent(ref);

    if (!snapshot) {
      logger.warn({ externalId: ref.externalId, dayId: ref.dayId }, "public Transicionais event not found");
    }

    return snapshot;
  }

  // primeira leitura sobre o retrato local da fase 1: as reservas passam ao dia do Transicionais,
  // os ids da fase 1 não existem no Transicionais: a reserva com instrumento vira só presença (E2.2)
  private async migrateSupabaseAttendances(current: CurrentEvent, snapshot: EventSnapshot): Promise<void> {
    await this.hormoniosRepo.moveAttendances({
      oldDayKey: current.dayKey,
      newDayKey: snapshot.event.dayKey,
      groupMap: {},
    });
  }
}
