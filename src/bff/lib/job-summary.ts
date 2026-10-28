import { SyncStatus } from "../domain/SyncStatus";

// lib.md L10
export function jobSummary(found: number, statuses: SyncStatus[]): Record<string, number> {
  const count = (status: SyncStatus) => statuses.filter((item) => item === status).length;

  return {
    found,
    synced: count(SyncStatus.Synced),
    pending: count(SyncStatus.Pending),
    manualRetry: count(SyncStatus.ManualRetry),
    rejected: count(SyncStatus.Rejected),
    notSent: found - statuses.length,
  };
}
