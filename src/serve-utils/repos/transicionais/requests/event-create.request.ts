import type { INewEventData } from "../../../interfaces/transicionais";

// corpo do POST v2/manager-events/details: o encontro de um dia só (startAt = endAt, D2)
export interface IEventCreateBody {
  name: string;
  location: string;
  startAt: string; // YYYY-MM-DD
  endAt: string;
}

export class EventCreateRequest {
  static fromDomain(data: INewEventData): IEventCreateBody {
    return { name: data.name, location: data.location, startAt: data.date, endAt: data.date };
  }
}
