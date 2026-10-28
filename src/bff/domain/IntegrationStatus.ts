import { SyncStatus } from "./SyncStatus";

export enum IntegrationEntity {
  Event = "EVENT",
  User = "USER",
  Attendance = "ATTENDANCE",
}

export class ErrorCtx {
  constructor(
    readonly statusCode: number,
    readonly error: string | null,
    readonly key: string | null,
    readonly message: string | null,
  ) {}

  toJson() {
    return { statusCode: this.statusCode, error: this.error, key: this.key, message: this.message };
  }
}

export const MAX_INTEGRATION_TENTATIVES = 10;
export const MAX_ITEMS_PER_JOB = 30;

const BACKOFF_MINUTES = [1, 5, 15, 60];
const MINUTE_MS = 60 * 1000;

export class IntegrationStatus {
  constructor(
    readonly id: string,
    readonly entity: IntegrationEntity,
    readonly entityId: string,
    readonly status: SyncStatus,
    readonly syncAt: Date,
    readonly tentatives: number = 0,
    readonly nextSyncAt: Date | null = null,
    readonly errorCtx: ErrorCtx | null = null,
  ) {}

  static create(entity: IntegrationEntity, entityId: string, now: Date): IntegrationStatus {
    const id = globalThis.crypto.randomUUID();

    return new IntegrationStatus(id, entity, entityId, SyncStatus.Pending, now);
  }

  synced(now: Date): IntegrationStatus {
    return new IntegrationStatus(this.id, this.entity, this.entityId, SyncStatus.Synced, now);
  }

  manualRetry(errorCtx: ErrorCtx, now: Date): IntegrationStatus {
    const tentatives = this.tentatives + 1;

    return new IntegrationStatus(this.id, this.entity, this.entityId, SyncStatus.ManualRetry, now, tentatives, null, errorCtx);
  }

  pending(errorCtx: ErrorCtx, now: Date): IntegrationStatus {
    const tentatives = this.tentatives + 1;

    if (tentatives >= MAX_INTEGRATION_TENTATIVES) {
      return this.manualRetry(errorCtx, now);
    }

    const nextSyncAt = this.nextSyncAtFrom(tentatives, now);

    return new IntegrationStatus(this.id, this.entity, this.entityId, SyncStatus.Pending, now, tentatives, nextSyncAt, errorCtx);
  }

  private nextSyncAtFrom(tentatives: number, now: Date): Date {
    const index = Math.min(tentatives, BACKOFF_MINUTES.length) - 1;
    const minutes = BACKOFF_MINUTES[index];

    return new Date(now.getTime() + minutes * MINUTE_MS);
  }

  toJson() {
    return {
      id: this.id,
      entity: this.entity,
      entityId: this.entityId,
      status: this.status,
      syncAt: this.syncAt.toISOString(),
      tentatives: this.tentatives,
      nextSyncAt: this.nextSyncAt ? this.nextSyncAt.toISOString() : null,
      errorCtx: this.errorCtx ? this.errorCtx.toJson() : null,
    };
  }
}
