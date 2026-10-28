import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { EventVisibility } from "../../../domain/Event";
import { parseResponse } from "../../parse-response";
import { EventDayResponse, EventDaySchema } from "./event-day.response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "findEventDetails";

const ManagedGroupSchema = z.object({ id: TransicionaisIdSchema });

const PublicationSupportSchema = z.object({ id: TransicionaisIdSchema });

const TotalVacancySchema = z.object({
  total: z.number().int().nullable(), // null = sem limite
});

const GroupCapacitySchema = z.object({
  groupId: TransicionaisIdSchema,
  total: z.number().int().nullable(),
});

const PublicationVacanciesSchema = z.object({
  total: TotalVacancySchema.nullable().transform((vacancy) => (vacancy ? vacancy.total : null)),
  groups: z.array(GroupCapacitySchema),
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

export class ManagedEventResponse {
  static toDomain(raw: unknown): any {
    const event = parseResponse(ManagedEventSchema, raw, InfraSource.Transicionais, OPERATION);

    return InvalidResponseError.guard(InfraSource.Transicionais, OPERATION, () => ManagedEventResponse.toEvent(event));
  }

  static toExternalId(raw: unknown): string | null {
    const event = parseResponse(ManagedEventSchema, raw, InfraSource.Transicionais, OPERATION);

    return event.public ? event.public.id : null;
  }

  private static toEvent(event: IManagedEvent): any {
    return { ...event, configDays: event.configDays.map(EventDayResponse.fromRaw) };
  }
}
