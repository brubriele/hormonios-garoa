import type { Event } from "../../../domain/Event";

// spec-8 B1
export interface IUpdateCurrentEventParams {
  eventId: string;
  isActive: boolean | null;
  isCurrent: boolean | null;
  nextEventId: string | null;
}

export class UpdateCurrentEventRequest {
  static fromDomain(event: Event, isActive: boolean | null, isCurrent: boolean | null, next: Event | null): IUpdateCurrentEventParams {
    return {
      eventId: event.id,
      isActive,
      isCurrent,
      nextEventId: next ? next.id : null,
    };
  }
}
