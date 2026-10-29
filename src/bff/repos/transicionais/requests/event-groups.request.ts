import type { Event } from "../../../domain/Event";
import { numericId } from "../transicionais-id";

// corpo do PUT v2/manager-events/details/{id}/groups: os grupos esperados a partir do dia em que o
// encontro foi criado
export interface IEventGroupsBody {
  groupId: number[];
  createdAt: string; // YYYY-MM-DD
}

export class EventGroupsRequest {
  static fromDomain(event: Event, createdAt: string): IEventGroupsBody {
    return {
      groupId: event.groups.map((group) => numericId(group.id, "groupId")),
      createdAt: createdAt.slice(0, 10),
    };
  }
}
