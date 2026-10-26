import type { IClaimPendingFilter } from "../../../interfaces/hormonios";

// parâmetros do rpc claim_pending (o skip locked fica na função)
export interface IClaimPendingParams {
  p_limit: number;
}

export class ClaimPendingRequest {
  static fromDomain(filter: IClaimPendingFilter): IClaimPendingParams {
    return { p_limit: filter.limit };
  }
}
