import { z } from "zod";
import {
  Event,
  EventCatalog,
  EventCatalogMetadata,
  EventCatalogStock,
  EventCatalogType,
  EventDescription,
  EventGroup,
  EventGroupMetadata,
  EventMetadata,
  EventVisibility,
} from "../../../domain/Event";
import { SyncStatus } from "../../../domain/SyncStatus";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";
import { LoanCatalogKind } from "./loan-catalog.response";

const OPERATION = "publicEvent";

const TimeSchema = z
  .string()
  .nullable()
  .transform((time) => (time ? time.slice(0, 5) : null));

const DaySupportSchema = z.object({
  id: TransicionaisIdSchema,
  title: z.string(),
  type: z.enum(LoanCatalogKind).optional().catch(undefined),
  isActive: z.boolean(),
  capacity: z.number().int().nullable(),
  rotativo: z.boolean(),
  confirmed: z.number().int().transform((confirmed) => Math.max(0, confirmed)),
  groupIds: z.array(TransicionaisIdSchema).default([]),
});

const ConfigDaySchema = z.object({
  id: z.number().int().nullable(),
  current: z.string().transform((date) => date.slice(0, 10)),
  startTime: TimeSchema,
  endTime: TimeSchema.optional().transform((time) => time ?? null),
  summary: z.object({ supports: z.array(DaySupportSchema) }).default({ supports: [] }),
});

const EventGroupSchema = z.object({
  id: TransicionaisIdSchema,
  name: z.string(),
});

const VacancySchema = z.object({ total: z.number().int().nullable() });

const GroupVacancySchema = z.object({
  groupId: TransicionaisIdSchema,
  total: z.number().int().nullable(),
});

const PublicationSchema = z.object({
  id: z.string().min(1),
  visibility: z.enum(EventVisibility),
  publicDescription: z.string().nullable(),
  releaseAt: z.string().nullable(),
  membersEarlyAt: z.string().nullable(),
  vacancies: z.object({
    configDayId: z.number().int().nullable().default(null),
    total: VacancySchema.nullable().transform((vacancy) => (vacancy ? vacancy.total : null)),
    groups: z.array(GroupVacancySchema).default([]),
  }),
  updatedAt: z.string().nullable().default(null),
});

// GET v2/community/organizations/{customId}/events/{externalId}
const PublicEventSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  location: z.string().nullable().transform((location) => location ?? ""),
  categoryId: TransicionaisIdSchema.nullable(),
  version: z.number().int(),
  hash: z.string().min(1).nullable().default(null),
  groups: z.array(EventGroupSchema),
  configDays: z.array(ConfigDaySchema).nonempty(),
  public: PublicationSchema,
});

type IPublicEvent = z.infer<typeof PublicEventSchema>;
type IConfigDay = z.infer<typeof ConfigDaySchema>;
type IDaySupport = z.infer<typeof DaySupportSchema>;

const CATALOG_TYPES: Record<LoanCatalogKind, EventCatalogType> = {
  [LoanCatalogKind.Instrument]: EventCatalogType.Instrument,
  [LoanCatalogKind.Accessory]: EventCatalogType.Accessory,
};

export class PublicEventResponse {
  static toDomain(raw: unknown, fetchedAt: string): Event {
    const event = parseResponse(PublicEventSchema, raw, InfraSource.Transicionais, OPERATION);

    return InvalidResponseError.guard(InfraSource.Transicionais, OPERATION, () =>
      PublicEventResponse.toEvent(event, fetchedAt),
    );
  }

  private static toEvent(event: IPublicEvent, fetchedAt: string): Event {
    const day = PublicEventResponse.findDay(event);
    const groups = event.groups.map((group) => PublicEventResponse.toGroup(group, event));
    const groupIds = groups.map((group) => group.id);
    const supports = day.summary.supports.filter((support) => support.isActive && support.type !== undefined);
    const catalog = supports.map((support) => PublicEventResponse.toCatalog(support, groupIds));
    const metadata = PublicEventResponse.toMetadata(event, day, fetchedAt);

    return new Event(
      "",
      event.location,
      null,
      day.current,
      day.startTime,
      null,
      groups,
      catalog,
      metadata,
    );
  }

  private static findDay(event: IPublicEvent): IConfigDay {
    const configDayId = event.public.vacancies.configDayId;
    const day = event.configDays.find((item) => item.id === configDayId);

    return day ?? event.configDays[0];
  }

  private static toGroup(group: z.infer<typeof EventGroupSchema>, event: IPublicEvent): EventGroup {
    const vacancy = event.public.vacancies.groups.find((item) => item.groupId === group.id);
    const exclusiveCapacity = vacancy ? vacancy.total : null;
    const metadata = new EventGroupMetadata(true, exclusiveCapacity);

    return new EventGroup(group.id, group.name, metadata);
  }

  private static toCatalog(support: IDaySupport, eventGroupIds: string[]): EventCatalog {
    const stock = new EventCatalogStock(support.capacity, support.rotativo, support.confirmed);
    const groupIds = support.groupIds.filter((id) => eventGroupIds.includes(id));
    const type = CATALOG_TYPES[support.type as LoanCatalogKind];
    const metadata = new EventCatalogMetadata(groupIds, type);

    return new EventCatalog(support.id, support.title, stock, metadata);
  }

  private static toMetadata(event: IPublicEvent, day: IConfigDay, fetchedAt: string): EventMetadata {
    const publication = event.public;
    const description = new EventDescription(
      publication.visibility,
      publication.publicDescription,
      publication.releaseAt,
      publication.membersEarlyAt,
      publication.vacancies.total,
    );

    return new EventMetadata(
      publication.id,
      event.id,
      day.id,
      event.name,
      event.categoryId,
      day.endTime,
      description,
      event.version,
      fetchedAt,
      SyncStatus.Synced,
      null,
      event.hash,
      publication.updatedAt,
    );
  }
}
