import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { type Event, EventCatalogType, EventVisibility } from "../../../domain/Event";
import { EventMapper } from "../../../domain/mappers/EventMapper";
import { SyncStatus } from "../../../domain/SyncStatus";
import { parseResponse } from "../../parse-response";

const OPERATION = "findEvent";

const EventCatalogStockSchema = z.object({
  total: z.number().int().nullable(),
  rotative: z.boolean(),
  used: z.number().int(),
});

const EventCatalogMetadataSchema = z.object({
  groupIds: z.array(z.string()),
  type: z.enum(EventCatalogType),
});

const EventCatalogSchema = z.object({
  id: z.string(),
  name: z.string(),
  stock: EventCatalogStockSchema,
  metadata: EventCatalogMetadataSchema,
});

const EventGroupMetadataSchema = z.object({
  active: z.boolean(),
  exclusiveCapacity: z.number().int().nullable(),
});

const EventGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  metadata: EventGroupMetadataSchema,
});

const EventDescriptionSchema = z.object({
  visibility: z.enum(EventVisibility),
  description: z.string().nullable(),
  releaseAt: z.string().nullable(),
  membersEarlyAt: z.string().nullable(),
  totalVacancies: z.number().int().nullable(),
});

const EventMetadataSchema = z.object({
  externalPublicId: z.string().nullable(),
  integrationId: z.number().int().nullable(),
  transicionaisDayId: z.number().int().nullable(),
  name: z.string(),
  categoryId: z.string().nullable(),
  endTime: z.string().nullable(),
  description: EventDescriptionSchema,
  version: z.number().int().nullable(),
  fetchedAt: z.string().nullable(),
  sync: z.enum(SyncStatus),
  syncError: z.string().nullable(),
  syncHash: z.string().nullable(),
  syncedAt: z.string().nullable(),
});

// jsonb de event.data: o Event inteiro (Event.toJson), sem o isActive (spec-8 C1)
export const EventDataSchema = z.object({
  id: z.guid(),
  location: z.string(),
  whatsappUrl: z.string().nullable(),
  date: z.string(),
  startTime: z.string().nullable(),
  groups: z.array(EventGroupSchema),
  catalog: z.array(EventCatalogSchema),
  metadata: EventMetadataSchema,
});

// spec-8 C1, C4
const CurrentEventEmbedSchema = z.object({
  isActive: z.boolean(),
});

// linha de event (só o data: as outras colunas são do repo)
const EventRowSchema = z
  .object({
    data: EventDataSchema,
    current_event: CurrentEventEmbedSchema.nullable().default(null),
  })
  .transform((row) => ({ ...row.data, isActive: row.current_event?.isActive ?? false }));

export class EventResponse {
  static toDomain(raw: unknown): Event {
    const row = parseResponse(
      EventRowSchema,
      raw,
      InfraSource.Supabase,
      OPERATION,
    );

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () =>
      EventMapper.fromData(row),
    );
  }
}
