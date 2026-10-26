import { AppError } from "../../errors/app-error";
import { createLogger } from "../../lib/logger";
import { type Booking, BookingSync } from "../../models/booking";
import type { CurrentEvent } from "../../models/current-event";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { SyncingUserBookingUsecase, type ISyncingUserBookingOutcome } from "./syncing-user-booking";

const logger = createLogger("SyncingBookingPendingUsecase");

// linhas por execução: cada envio tem timeout de 3 s, e os envios vão em paralelo
const CLAIM_LIMIT = 10;

export interface ISyncingBookingPendingResult {
  claimed: number;
  synced: number;
  rejected: number;
  pending: number; // continua PENDING: o cron tenta de novo mais tarde
  manualRetry: number; // 400, 409 ou 422: fora do cron até o ajuste manual (D50)
}

// envia o estado atual das linhas PENDING vencidas de todos os dias do Transicionais (D45) e grava o
// resultado com a trava do updated_at ("Cron de sincronização" de bff-fase-2.md). Com retrato local
// (encerramento pendente), espera o nextEvent. GET /api/cron/sync?type=booking
export class SyncingBookingPendingUsecase {
  private readonly syncingUserBooking: SyncingUserBookingUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.syncingUserBooking = new SyncingUserBookingUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(): Promise<ISyncingBookingPendingResult> {
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

  private async _execute(): Promise<ISyncingBookingPendingResult> {
    const event = await this.findSupabaseCurrentEvent();

    // retrato local (fase 1 ou encerramento pendente): nada vai ao Transicionais até ele existir lá
    if (!event.isFromTransicionais) {
      return { claimed: 0, synced: 0, rejected: 0, pending: 0, manualRetry: 0 };
    }

    const bookings = await this.claimSupabasePendingBookings();
    const outcomes = await Promise.all(
      bookings.map((booking) => this.syncingUserBooking.execute({ booking, event, ip: null })),
    );

    return this.countOutcomes(outcomes);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // todos os dias do Transicionais, não só o atual (D45, revê a D11)
  private async claimSupabasePendingBookings(): Promise<Booking[]> {
    return this.hormoniosRepo.claimPending({ limit: CLAIM_LIMIT });
  }

  private countOutcomes(outcomes: ISyncingUserBookingOutcome[]): ISyncingBookingPendingResult {
    return {
      claimed: outcomes.length,
      synced: outcomes.filter((outcome) => outcome.sync === BookingSync.Synced).length,
      rejected: outcomes.filter((outcome) => outcome.sync === BookingSync.Rejected).length,
      pending: outcomes.filter((outcome) => outcome.sync === BookingSync.Pending).length,
      manualRetry: outcomes.filter((outcome) => outcome.sync === BookingSync.ManualRetry).length,
    };
  }
}
