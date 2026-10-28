import type { Event } from "../../../domain/Event";

// upsert de event pelo id: o Event inteiro vai em data; as colunas repetem o que o repo consulta
export interface RowEvent {
  id: string;
  integrationId: number | null;
  transicionaisDayId: number | null;
  syncHash: string | null;
  syncedAt: string | null;
  data: ReturnType<Event["toJson"]>;
  updated_at: string;
}

export class EventRequest {
  static fromDomain(event: Event, now: string): RowEvent {
    return {
      id: event.id,
      integrationId: event.metadata.integrationId,
      transicionaisDayId: event.metadata.transicionaisDayId,
      syncHash: event.metadata.syncHash,
      syncedAt: event.metadata.syncedAt,
      data: event.toJson(),
      updated_at: now,
    };
  }
}
