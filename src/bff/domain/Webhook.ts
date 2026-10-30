import type { SyncStatus } from "./SyncStatus";

export enum WebhookEntity {
  Event = "event",
  User = "user",
  Validation = "validation",
}

export class Webhook {
  constructor(
    readonly id: number | string,
    readonly entity: WebhookEntity,
  ) {}
}

export class WebhookResult {
  constructor(
    readonly status: SyncStatus,
    readonly accept: boolean,
  ) {}

  toJson() {
    return { status: this.status, accept: this.accept };
  }
}
