import { AppError, UpstreamUnavailableError } from "../../errors/app-error";
import { UpstreamBadContractError, UpstreamResponseError } from "../../errors/infra-error";
import { today } from "../../lib/date";
import { createLogger } from "../../lib/logger";
import type { CurrentEvent } from "../../models/current-event";
import type { CurrentEventSnapshot } from "../../models/current-event-snapshot";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { IEventRef, ITransicionaisRepo } from "../../interfaces/transicionais";

const logger = createLogger("ReceivingCurrentEventUsecase");

export interface IReceivingCurrentEventResult {
  changed: boolean; // o retrato gravado mudou
  available: boolean; // false = o Transicionais não respondeu (ou o encontro não existe): o retrato ficou como estava
}

// refreshCurrentEvent() (R13, revista pela E2.7): o encontro atual é o do retrato, enquanto estiver na
// listagem de manager do Transicionais (Públicos de hoje em diante); senão, o primeiro dela. Lê e grava
// o retrato com a trava. Usado por GET /api/ensaio, GET /api/cron/event e pelas ações da Produção.
export class ReceivingCurrentEventUsecase {
  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(): Promise<IReceivingCurrentEventResult> {
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

  private async _execute(): Promise<IReceivingCurrentEventResult> {
    // o próximo ensaio ainda só existe no local: ele é a verdade até o cron criá-lo lá (D51, R2)
    if (await this.hormoniosRepo.findOpenNextEvent()) {
      return { changed: false, available: true };
    }

    const current = await this.findSupabaseCurrentEvent();
    const snapshot = await this.findTransicionaisSnapshot(current);

    if (!snapshot) {
      return { changed: false, available: false }; // não mexe no retrato
    }

    if (current && !current.isFromTransicionais) {
      await this.migrateSupabaseBookings(current, snapshot);
    }

    const changed = await this.hormoniosRepo.saveSnapshot(await this.applySupabasePendingCapacities(snapshot));

    return { changed, available: true };
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent | null> {
    return this.hormoniosRepo.findCurrentEvent();
  }

  // o estoque que ainda não foi ao Transicionais fica por cima do lido (D53)
  private async applySupabasePendingCapacities(snapshot: CurrentEventSnapshot): Promise<CurrentEventSnapshot> {
    return snapshot.withPendingCapacities(await this.hormoniosRepo.listPendingCapacities());
  }

  // null = o encontro não existe ou o Transicionais está fora do ar (plano de falha: fica o retrato)
  private async findTransicionaisSnapshot(current: CurrentEvent | null): Promise<CurrentEventSnapshot | null> {
    try {
      const ref = await this.findTransicionaisCurrentRef(current);

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

  // o encontro do retrato segue o atual enquanto estiver na listagem (o "Encerrar ensaio" não apaga o
  // antigo, D2); o dia vem da listagem (a troca de data muda o dia). Fora dela: o primeiro (E2.7)
  private async findTransicionaisCurrentRef(current: CurrentEvent | null): Promise<IEventRef | null> {
    const refs = await this.transicionaisRepo.listPublicEventsFrom(today());
    const saved = current?.isFromTransicionais ? refs.find((item) => item.externalId === current.externalId) : undefined;
    const ref = saved ?? refs[0] ?? null;

    if (!ref) {
      logger.warn("no public Transicionais event from today on");
    }

    return ref;
  }

  private async findTransicionaisPublicEvent(ref: IEventRef): Promise<CurrentEventSnapshot | null> {
    const snapshot = await this.transicionaisRepo.findPublicEvent(ref);

    if (!snapshot) {
      logger.warn({ externalId: ref.externalId, dayId: ref.dayId }, "public Transicionais event not found");
    }

    return snapshot;
  }

  // primeira leitura sobre o retrato local da fase 1: as reservas passam ao dia do Transicionais,
  // os ids da fase 1 não existem no Transicionais: a reserva com instrumento vira só presença (E2.2)
  private async migrateSupabaseBookings(current: CurrentEvent, snapshot: CurrentEventSnapshot): Promise<void> {
    await this.hormoniosRepo.moveBookings({
      oldDayKey: current.dayKey,
      newDayKey: snapshot.event.dayKey,
      groupMap: {},
    });
  }
}
