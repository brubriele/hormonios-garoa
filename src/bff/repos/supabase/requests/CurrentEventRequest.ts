import type { Event } from "../../../domain/Event";

// spec-8 B4
export interface RowCurrentEvent {
  eventId: string;
  isActive: boolean;
  isCurrent: boolean;
  nextEventId: null;
}

export class CurrentEventRequest {
  static fromDomain(event: Event, isCurrent: boolean): RowCurrentEvent {
    return {
      eventId: event.id,
      isActive: event.isActive,
      isCurrent,
      nextEventId: null,
    };
  }
}
