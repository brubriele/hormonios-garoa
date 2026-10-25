import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { EventPublication, EventVisibility } from "../../../models/event-publication";
import { GroupVacancy } from "../../../models/group-vacancy";
import { ManagedEvent } from "../../../models/managed-event";
import { parseResponse } from "../../parse-response";
import { EventDayResponse, EventDaySchema } from "./event-day.response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "findEventDetails";

const ManagedGroupSchema = z.object({ id: TransicionaisIdSchema });

const PublicationSupportSchema = z.object({ id: TransicionaisIdSchema });

const TotalVacancySchema = z.object({
  total: z.number().int().nullable(), // null = sem limite
});

const GroupVacancySchema = z.object({
  groupId: TransicionaisIdSchema,
  total: z.number().int().nullable(),
});

const PublicationVacanciesSchema = z.object({
  total: TotalVacancySchema.nullable().transform((vacancy) => (vacancy ? vacancy.total : null)),
  groups: z.array(GroupVacancySchema),
});

const PublicationSchema = z.object({
  id: TransicionaisIdSchema, // o id do link público (D6)
  visibility: z.enum(EventVisibility),
  publicDescription: z.string().nullable(),
  releaseAt: z.string().nullable(),
  membersEarlyAt: z.string().nullable(),
  guestDeadlineMinutes: z.number().int().nullable(),
  supports: z.array(PublicationSupportSchema),
  vacancies: PublicationVacanciesSchema,
});

// GET v2/manager-events/details/{id} (EventDetails): só o que as escritas da Produção leem
const ManagedEventSchema = z.object({
  id: TransicionaisIdSchema,
  name: z.string(),
  startAt: z.string().transform((date) => date.slice(0, 10)),
  endAt: z.string().transform((date) => date.slice(0, 10)),
  categoryId: TransicionaisIdSchema.nullable(),
  createdAt: z.string(),
  version: z.number().int(),
  groups: z.array(ManagedGroupSchema),
  configDays: z.array(EventDaySchema),
  public: PublicationSchema.nullable(), // null = Interno
});

type IManagedEvent = z.infer<typeof ManagedEventSchema>;
type IPublication = z.infer<typeof PublicationSchema>;

export class ManagedEventResponse {
  static toDomain(raw: unknown): ManagedEvent {
    const event = parseResponse(ManagedEventSchema, raw, InfraSource.Transicionais, OPERATION);

    return InvalidResponseError.guard(InfraSource.Transicionais, OPERATION, () => ManagedEventResponse.toEvent(event));
  }

  private static toEvent(event: IManagedEvent): ManagedEvent {
    return new ManagedEvent(
      event.id,
      event.name,
      event.startAt,
      event.endAt,
      event.categoryId,
      event.createdAt,
      event.version,
      event.groups.map((group) => group.id),
      event.configDays.map(EventDayResponse.fromRaw),
      event.public ? ManagedEventResponse.toPublication(event.public) : null,
    );
  }

  private static toPublication(publication: IPublication): EventPublication {
    return new EventPublication(
      publication.id,
      publication.visibility,
      publication.publicDescription,
      publication.releaseAt,
      publication.membersEarlyAt,
      publication.guestDeadlineMinutes,
      publication.supports.map((support) => support.id),
      publication.vacancies.total,
      publication.vacancies.groups.map((group) => new GroupVacancy(group.groupId, group.total)),
    );
  }
}
