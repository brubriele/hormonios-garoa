import type { Event } from "../../../domain/Event";

// upsert de event pelo id: o Event inteiro vai em data, sem o isActive (spec-8 C1); as colunas repetem o que o repo consulta
export interface RowEvent {
  id: string;
  integrationId: number | null;
  transicionaisDayId: number | null;
  syncHash: string | null;
  syncedAt: string | null;
  data: Omit<ReturnType<Event["toJson"]>, "isActive">;
  updated_at: string;
}

export class EventRequest {
  static fromDomain(event: Event, now: string): RowEvent {
    const { isActive: _isActive, ...data } = event.toJson();

    return {
      id: event.id,
      integrationId: event.metadata.integrationId,
      transicionaisDayId: event.metadata.transicionaisDayId,
      syncHash: event.metadata.syncHash,
      syncedAt: event.metadata.syncedAt,
      data,
      updated_at: now,
    };
  }
}
