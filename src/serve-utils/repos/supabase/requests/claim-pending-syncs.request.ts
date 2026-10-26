import type { IClaimPendingSyncsFilter } from "../../../interfaces/hormonios";
import type { PendingSyncKind } from "../../../models/pending-sync";

// parâmetros do rpc claim_syncs (o skip locked fica na função)
export interface IClaimPendingSyncsParams {
  p_kind: PendingSyncKind;
  p_limit: number;
}

export class ClaimPendingSyncsRequest {
  static fromDomain(kind: PendingSyncKind, filter: IClaimPendingSyncsFilter): IClaimPendingSyncsParams {
    return { p_kind: kind, p_limit: filter.limit };
  }
}
