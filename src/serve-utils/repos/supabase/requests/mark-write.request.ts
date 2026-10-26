import type { ErrorKey } from "../../../errors/app-error";
import type { IMarkWriteData } from "../../../interfaces/hormonios";
import type { ITransicionaisErrorCause } from "../../../interfaces/transicionais";
import type { UUID } from "../../../interfaces/uuid";
import { PendingWriteMode } from "../../../models/pending-write";

// parâmetros do rpc marcar_escrita (a trava do updated_at fica na função)
export interface IMarkWriteParams {
  p_id: UUID;
  p_updated_at: string;
  p_mode: PendingWriteMode;
  p_error: ErrorKey | null;
  p_error_cause: ITransicionaisErrorCause | null; // jsonb: o erro do Transicionais como veio (D50)
}

export class MarkWriteRequest {
  static fromDomain(data: IMarkWriteData): IMarkWriteParams {
    return {
      p_id: data.id,
      p_updated_at: data.updatedAt,
      p_mode: data.mode,
      p_error: data.mode === PendingWriteMode.Rejected ? data.error : null,
      p_error_cause: data.errorCause,
    };
  }
}
