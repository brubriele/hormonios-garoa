import type { Event, EventGroup, EventVisibility } from "../../../domain/Event";
import { numericId } from "../transicionais-id";

export interface IGroupCapacityBody {
  groupId: number;
  capacity: number | null; // null = sem limite
}

// `public` no PUT v2/manager-events/details/{id}: inteiro (dúvida D4)
export interface IEventPublicationBody {
  visibility: EventVisibility;
  publicDescription: string | null;
  releaseAt: string | null;
  membersEarlyAt: string | null;
  guestDeadlineMinutes: number | null;
  supportTypeIds: number[];
  capacity: number | null;
  groups: IGroupCapacityBody[];
}

export class PublicationSettingsRequest {
  static fromDomain(event: Event): IEventPublicationBody {
    const description = event.metadata.description;

    return {
      visibility: description.visibility,
      publicDescription: description.description,
      releaseAt: description.releaseAt,
      membersEarlyAt: description.membersEarlyAt,
      guestDeadlineMinutes: null,
      supportTypeIds: event.catalog.map((item) => numericId(item.id, "supportTypeId")),
      // spec-4 B9
      capacity: description.totalVacancies,
      groups: event.groups.map((group) => PublicationSettingsRequest.toGroupCapacity(group)),
    };
  }

  private static toGroupCapacity(group: EventGroup): IGroupCapacityBody {
    return { groupId: numericId(group.id, "groupId"), capacity: group.metadata.exclusiveCapacity };
  }
}
