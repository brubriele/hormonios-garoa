import type { Event } from "../../../domain/Event";

// corpo do POST v2/manager-events/details: o encontro de um dia só (startAt = endAt, D2)
export interface IEventCreateBody {
  name: string;
  location: string;
  startAt: string; // YYYY-MM-DD
  endAt: string;
}

export class EventCreateRequest {
  static fromDomain(event: Event): IEventCreateBody {
    const name = EventCreateRequest.toName(event);

    return { name, location: event.location, startAt: event.date, endAt: event.date };
  }

  static toName(event: Event): string {
    return `${event.metadata.name}#${event.id}`;
  }
}
