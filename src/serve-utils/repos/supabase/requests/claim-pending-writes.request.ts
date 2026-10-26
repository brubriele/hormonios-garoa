import type { IClaimPendingWritesFilter } from "../../../interfaces/hormonios";
import type { PendingWriteKind } from "../../../models/pending-write";

// parâmetros do rpc claim_escritas (o skip locked fica na função)
export interface IClaimPendingWritesParams {
  p_kind: PendingWriteKind;
  p_limit: number;
}

export class ClaimPendingWritesRequest {
  static fromDomain(kind: PendingWriteKind, filter: IClaimPendingWritesFilter): IClaimPendingWritesParams {
    return { p_kind: kind, p_limit: filter.limit };
  }
}
