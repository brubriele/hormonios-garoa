import type { PublicationSettings, EventVisibility } from "../../../models/publication-settings";
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
  static fromDomain(publication: PublicationSettings): IEventPublicationBody {
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
