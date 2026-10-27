import type { Event } from "../../../domain/Event";
import { PublicationSettingsRequest, type IEventPublicationBody } from "./publication-settings.request";

// corpo do PUT v2/manager-events/details/{id}: a version e a publicação inteira
export interface IEventUpdateBody {
  version: number;
  public: IEventPublicationBody;
}

export class EventUpdateRequest {
  static fromDomain(version: number, event: Event): IEventUpdateBody {
    return { version, public: PublicationSettingsRequest.fromDomain(event) };
  }
}
