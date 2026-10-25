import type { IEventChanges } from "../../../interfaces/transicionais";
import { EventPublicationRequest, type IEventPublicationBody } from "./event-publication.request";

// corpo do PUT v2/manager-events/details/{id}: a version e só o que muda (campo ausente = não mexe)
export interface IEventUpdateBody {
  version: number;
  location?: string;
  startAt?: string; // YYYY-MM-DD
  endAt?: string; // YYYY-MM-DD
  public?: IEventPublicationBody;
}

export class EventUpdateRequest {
  static fromDomain(version: number, changes: IEventChanges): IEventUpdateBody {
    const body: IEventUpdateBody = { version };

    if (changes.location !== undefined) {
      body.location = changes.location;
    }

    if (changes.startDate !== undefined) {
      body.startAt = changes.startDate;
    }

    if (changes.endDate !== undefined) {
      body.endAt = changes.endDate;
    }

    if (changes.publication !== undefined) {
      body.public = EventPublicationRequest.fromDomain(changes.publication);
    }

    return body;
  }
}
