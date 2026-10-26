import {
  AppError,
  type ErrorKey,
  NotFoundError,
  StockBelowReservationsError,
  UpstreamUnavailableError,
} from "../../errors/app-error";
import { UpstreamBadContractError, UpstreamResponseError } from "../../errors/infra-error";
import { createLogger } from "../../lib/logger";
import type { PendingSupportCapacity } from "../../models/pending-support-capacity";
import { PendingWriteMode } from "../../models/pending-write";
import type { IHormoniosRepo, IMarkWriteData } from "../../interfaces/hormonios";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";

const logger = createLogger("SyncingStockPendingUsecase");

// mudanças por execução: vão uma por vez (cada uma lê e grava o catálogo inteiro)
const CLAIM_LIMIT = 5;

export interface ISyncingStockPendingResult {
  claimed: number;
  synced: number;
  rejected: number;
  pending: number; // continua PENDING: o cron tenta de novo mais tarde
  manualRetry: number; // 400, 409 ou 422: fora do cron até o ajuste manual (D50)
}

// envia ao Transicionais o estoque que ficou na fila (D53), como o online: o catálogo inteiro, só com o
// capacity trocado (D26). Recusa de regra: REJECTED, e o próximo refresh volta o valor de lá (D52). Sem
// rota: GET /api/cron/sync?type=stock
export class SyncingStockPendingUsecase {
  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(): Promise<ISyncingStockPendingResult> {
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

  private async _execute(): Promise<ISyncingStockPendingResult> {
    const pendings = await this.claimSupabasePendingCapacities();
    const modes: PendingWriteMode[] = [];

    for (const pending of pendings) {
      const mark = await this.sendTransicionaisCapacity(pending);

      await this.hormoniosRepo.markWrite(mark); // false = mudou durante o envio: vai o valor novo
      modes.push(mark.mode);
    }

    return this.countModes(modes);
  }

  private async claimSupabasePendingCapacities(): Promise<PendingSupportCapacity[]> {
    return this.hormoniosRepo.claimPendingCapacities({ limit: CLAIM_LIMIT });
  }

  private async sendTransicionaisCapacity(pending: PendingSupportCapacity): Promise<IMarkWriteData> {
    try {
      const supportType = await this.transicionaisRepo.findSupportType(pending.supportId);

      if (!supportType) {
        throw new NotFoundError("Support Not Found");
      }

      await this.transicionaisRepo.saveSupportType(supportType.withCapacity(pending.capacity));

      return this.buildMark(pending, PendingWriteMode.Synced);
    } catch (error) {
      if (error instanceof StockBelowReservationsError || error instanceof NotFoundError) {
        logger.warn({ supportId: pending.supportId, key: error.key }, "pending capacity refused by Transicionais (D52)");
        return this.buildMark(pending, PendingWriteMode.Rejected, error.key);
      }

      return this.buildFailedMark(error, pending);
    }
  }

  private buildMark(pending: PendingSupportCapacity, mode: PendingWriteMode, error: ErrorKey | null = null): IMarkWriteData {
    return { id: pending.id, updatedAt: pending.updatedAt, mode, error, errorCause: null };
  }

  // fora do ar ou outra falha: PENDING com espera. 400, 409 ou 422: MANUAL_RETRY. O erro do Transicionais
  // é gravado como veio (D50)
  private buildFailedMark(error: unknown, pending: PendingSupportCapacity): IMarkWriteData {
    if (error instanceof UpstreamBadContractError) {
      logger.error({ writeId: pending.id, errorCause: error.errorCause }, "pending capacity needs a manual retry (D50)");
      return { ...this.buildMark(pending, PendingWriteMode.ManualRetry), errorCause: error.errorCause };
    }

    if (error instanceof UpstreamUnavailableError) {
      return this.buildMark(pending, PendingWriteMode.Backoff);
    }

    logger.error({ err: error, writeId: pending.id }, "pending capacity not sent");
    const errorCause = error instanceof UpstreamResponseError ? error.errorCause : null;

    return { ...this.buildMark(pending, PendingWriteMode.Backoff), errorCause };
  }

  private countModes(modes: PendingWriteMode[]): ISyncingStockPendingResult {
    return {
      claimed: modes.length,
      synced: modes.filter((mode) => mode === PendingWriteMode.Synced).length,
      rejected: modes.filter((mode) => mode === PendingWriteMode.Rejected).length,
      pending: modes.filter((mode) => mode === PendingWriteMode.Backoff).length,
      manualRetry: modes.filter((mode) => mode === PendingWriteMode.ManualRetry).length,
    };
  }
}
