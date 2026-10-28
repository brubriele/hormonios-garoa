import type { IntegrationStatus } from "../../../domain/IntegrationStatus";

export interface RowIntegrationStatus {
  id: string;
  entity: string;
  entityId: string;
  status: string;
  syncAt: string;
  tentatives: number;
  nextSyncAt: string | null;
  errorCtx: ReturnType<IntegrationStatus["toJson"]>["errorCtx"];
  updated_at: string;
}

export class IntegrationStatusRequest {
  static fromDomain(integrationStatus: IntegrationStatus, now: string): RowIntegrationStatus {
    const json = integrationStatus.toJson();

    return { ...json, updated_at: now };
  }
}
