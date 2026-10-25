import { AppError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import { type Attendance, AttendanceSync } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import { SendAttendanceUsecase, type ISendAttendanceOutcome } from "./send-attendance";

const logger = createLogger("SyncPendingAttendancesUsecase");

// linhas por execução: cada envio tem timeout de 3 s, e os envios vão em paralelo
const CLAIM_LIMIT = 10;

export interface ISyncPendingAttendancesResult {
  claimed: number;
  synced: number;
  rejected: number;
  pending: number;
}

// GET /api/cron/sync ("Cron de sincronização" de bff-fase-2.md): envia o estado atual das linhas
// PENDING vencidas do dia atual e grava o resultado com a trava do updated_at
export class SyncPendingAttendancesUsecase {
  private readonly sendAttendance: SendAttendanceUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.sendAttendance = new SendAttendanceUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(): Promise<ISyncPendingAttendancesResult> {
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

  private async _execute(): Promise<ISyncPendingAttendancesResult> {
    const event = await this.findSupabaseCurrentEvent();

    // retrato local da fase 1: nada vai ao Transicionais até a primeira leitura migrar as linhas
    if (!event.isFromTransicionais) {
      return { claimed: 0, synced: 0, rejected: 0, pending: 0 };
    }

    const attendances = await this.claimSupabasePendingAttendances(event);
    const outcomes = await Promise.all(
      attendances.map((attendance) => this.sendAttendance.execute({ attendance, event, ip: null })),
    );

    return this.countOutcomes(outcomes);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // só o dia atual (D11)
  private async claimSupabasePendingAttendances(event: CurrentEvent): Promise<Attendance[]> {
    return this.hormoniosRepo.claimPending({ dayKey: event.dayKey, limit: CLAIM_LIMIT });
  }

  private countOutcomes(outcomes: ISendAttendanceOutcome[]): ISyncPendingAttendancesResult {
    return {
      claimed: outcomes.length,
      synced: outcomes.filter((outcome) => outcome.sync === AttendanceSync.Synced).length,
      rejected: outcomes.filter((outcome) => outcome.sync === AttendanceSync.Rejected).length,
      pending: outcomes.filter((outcome) => outcome.sync === AttendanceSync.Pending).length,
    };
  }
}
