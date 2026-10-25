import { AppError } from "../errors/app-error";
import type { CurrentEvent } from "../models/current-event";
import type { EventSnapshot } from "../models/event-snapshot";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { IFindCurrentEventResult, ITransicionaisRepo } from "../interfaces/transicionais";

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

      console.error("[RefreshCurrentEventUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  private async _execute(): Promise<IRefreshCurrentEventResult> {
    const current = await this.findSupabaseCurrentEvent();
    const result = await this.findTransicionaisSnapshot();

    if (result.status !== "FOUND") {
      return { changed: false, available: false }; // não mexe no retrato
    }

    if (current && !current.isFromTransicionais) {
      await this.migrateSupabaseAttendances(current, result.snapshot);
    }

    const changed = await this.hormoniosRepo.saveSnapshot(result.snapshot);

    return { changed, available: true };
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent | null> {
    return this.hormoniosRepo.findCurrentEvent();
  }

  private async findTransicionaisSnapshot(): Promise<IFindCurrentEventResult> {
    const result = await this.transicionaisRepo.findCurrentEvent();

    if (result.status === "NOT_FOUND") {
      console.error("[RefreshCurrentEventUsecase] no public Transicionais event from today on");
    }

    return result;
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
