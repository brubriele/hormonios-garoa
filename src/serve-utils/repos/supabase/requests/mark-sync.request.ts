import type { ErrorKey } from "../../../errors/app-error";
import type { IMarkSyncData } from "../../../interfaces/hormonios";
import type { ITransicionaisErrorCause } from "../../../interfaces/transicionais";
import type { UUID } from "../../../interfaces/uuid";
import { SyncMode } from "../../../models/booking";

// parâmetros do rpc marcar_sync (a trava do updated_at fica na função); o que não é do modo vai null
export interface IMarkSyncParams {
  p_id: UUID;
  p_updated_at: string;
  p_mode: SyncMode;
  p_order_id: string | null;
  p_changed_at: string | null;
  p_guest_id: string | null;
  p_hash: string | null;
  p_error: ErrorKey | null;
  p_error_cause: ITransicionaisErrorCause | null; // jsonb: o erro do Transicionais como veio (D50)
}

export class MarkSyncRequest {
  static fromDomain(data: IMarkSyncData): IMarkSyncParams {
    const synced = data.mode === SyncMode.Synced ? data : null;

    return {
      p_id: data.bookingId,
      p_updated_at: data.updatedAt,
      p_mode: data.mode,
      p_order_id: synced ? synced.orderId : null,
      p_changed_at: synced ? synced.changedAt : null,
      p_guest_id: synced ? synced.guestId : null,
      p_hash: synced ? synced.hash : null,
      p_error: data.mode === SyncMode.Rejected ? data.error : null,
      p_error_cause: "errorCause" in data ? data.errorCause : null,
    };
  }
}
