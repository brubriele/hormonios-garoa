import type { Event, EventGroup, EventVisibility } from "../../../domain/Event";
import { numericId } from "../transicionais-id";

export interface IGroupCapacityBody {
  groupId: number;
  total: number | null; // null = sem limite
}

export interface IPublicationVacanciesBody {
  total: number | null;
  groups: IGroupCapacityBody[];
}

// `public` no PUT v2/manager-events/details/{id}: inteiro (dúvida D4)
export interface IEventPublicationBody {
  visibility: EventVisibility;
  publicDescription: string | null;
  releaseAt: string | null;
  membersEarlyAt: string | null;
  guestDeadlineMinutes: number | null;
  supportTypeIds: number[];
  vacancies: IPublicationVacanciesBody;
}

export class PublicationSettingsRequest {
  static fromDomain(event: Event): IEventPublicationBody {
    const description = event.metadata.description;
    const groups = event.groups.filter((group) => group.metadata.exclusiveCapacity !== null);

    return {
      visibility: description.visibility,
      publicDescription: description.description,
      releaseAt: description.releaseAt,
      membersEarlyAt: description.membersEarlyAt,
      guestDeadlineMinutes: null,
      supportTypeIds: event.catalog.map((item) => numericId(item.id, "supportTypeId")),
      vacancies: {
        total: description.totalVacancies,
        groups: groups.map((group) => PublicationSettingsRequest.toGroupCapacity(group)),
      },
    };
  }

  private static toGroupCapacity(group: EventGroup): IGroupCapacityBody {
    return { groupId: numericId(group.id, "groupId"), total: group.metadata.exclusiveCapacity };
  }
}
