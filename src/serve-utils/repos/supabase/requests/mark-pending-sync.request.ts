import type { ErrorKey } from "../../../errors/app-error";
import type { IMarkPendingSyncData } from "../../../interfaces/hormonios";
import type { ITransicionaisErrorCause } from "../../../interfaces/transicionais";
import type { UUID } from "../../../interfaces/uuid";
import { PendingSyncMode } from "../../../models/pending-sync";

// parâmetros do rpc marcar_sync_pendente (a trava do updated_at fica na função)
export interface IMarkPendingSyncParams {
  p_id: UUID;
  p_updated_at: string;
  p_mode: PendingSyncMode;
  p_error: ErrorKey | null;
  p_error_cause: ITransicionaisErrorCause | null; // jsonb: o erro do Transicionais como veio (D50)
}

export class MarkPendingSyncRequest {
  static fromDomain(data: IMarkPendingSyncData): IMarkPendingSyncParams {
    return {
      p_id: data.id,
      p_updated_at: data.updatedAt,
      p_mode: data.mode,
      p_error: data.mode === PendingSyncMode.Rejected ? data.error : null,
      p_error_cause: data.errorCause,
    };
  }
}
