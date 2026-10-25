import type { EventPublication, EventVisibility } from "../../../models/event-publication";
import { numericId } from "../transicionais-id";

export interface IGroupVacancyBody {
  groupId: number;
  total: number | null; // null = sem limite
}

export interface IPublicationVacanciesBody {
  total: number | null;
  groups: IGroupVacancyBody[];
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

export class EventPublicationRequest {
  static fromDomain(publication: EventPublication): IEventPublicationBody {
    return {
      visibility: publication.visibility,
      publicDescription: publication.description,
      releaseAt: publication.releaseAt,
      membersEarlyAt: publication.membersEarlyAt,
      guestDeadlineMinutes: publication.guestDeadlineMinutes,
      supportTypeIds: publication.supportIds.map((id) => numericId(id, "supportTypeId")),
      vacancies: {
        total: publication.totalVacancies,
        groups: publication.groupVacancies.map((vacancy) => ({
          groupId: numericId(vacancy.groupId, "groupId"),
          total: vacancy.total,
        })),
      },
    };
  }
}
