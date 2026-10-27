import { z } from "zod";
import { Event, EventCatalogType, EventVisibility } from "../../domain/Event";
import { ErrorCtx, IntegrationEntity, IntegrationStatus } from "../../domain/IntegrationStatus";
import { EventMapper } from "../../domain/mappers/EventMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import { AppError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { CountSchema, NonBlankSchema, validateSchema } from "../../lib/schema";
import { toErrorCtx } from "../../lib/upstream";

const logger = createLogger("CreatingInternalEventUsecase", LogContext.Event);

const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/);

export const EventBodySchema = z
  .object({
    location: NonBlankSchema,
    whatsappUrl: z.string().nullable(),
    date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    startTime: TimeSchema.nullable(),
    bookingOpen: z.boolean().nullable(),
    groups: z.array(
      z.object({
        id: NonBlankSchema,
        name: NonBlankSchema,
        metadata: z.object({
          active: z.boolean(),
          exclusiveCapacity: CountSchema.nullable(),
        }),
      }),
    ),
    catalog: z.array(
      z.object({
        id: NonBlankSchema,
        name: NonBlankSchema,
        stock: z.object({
          total: CountSchema.nullable(),
          rotative: z.boolean(),
        }),
        metadata: z.object({
          groupIds: z.array(z.string()),
          type: z.enum(EventCatalogType),
        }),
      }),
    ),
    metadata: z.object({
      name: NonBlankSchema,
      categoryId: z.string().nullable(),
      endTime: TimeSchema.nullable(),
      description: z.object({
        visibility: z.enum(EventVisibility),
        description: z.string().nullable(),
        releaseAt: z.string().nullable(),
        membersEarlyAt: z.string().nullable(),
        totalVacancies: CountSchema.nullable(),
      }),
    }),
  })
  .refine(
    (body) => body.catalog.every((item) => item.metadata.groupIds.every((groupId) => body.groups.some((group) => group.id === groupId))),
    { path: ["catalog"], message: "must reference existing groups" },
  )
  .refine(
    (body) => {
      const instruments = body.catalog.filter((item) => item.metadata.type === EventCatalogType.Instrument);
      const groupIds = instruments.flatMap((item) => item.metadata.groupIds);
      const uniqueGroupIds = new Set(groupIds);

      return uniqueGroupIds.size === groupIds.length;
    },
    { path: ["catalog"], message: "must have at most one INSTRUMENT per group" },
  );

const CreatingInternalEventInputSchema = z.instanceof(Event);

export class CreatingInternalEventUsecase {
  constructor(
    private readonly hormoniosRepository: IHormoniosRepository,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(data: Event): Promise<Event> {
    try {
      return await this._execute(data);
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error, { hormoniosEventId: data.id });
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(data: Event): Promise<Event> {
    logger.track("creating internal event", { hormoniosEventId: data.id });

    const valid = this.validateInput(data);
    const event = this.withId(valid);
    const created = await this.createEvent(event);

    return this.sync(created);
  }

  private validateInput(data: Event): Event {
    const event = validateSchema(CreatingInternalEventInputSchema, data);
    const json = event.toJson();

    validateSchema(EventBodySchema, json);

    return event;
  }

  private withId(event: Event): Event {
    const id = globalThis.crypto.randomUUID();
    const json = event.toJson();

    return EventMapper.fromData({ ...json, id });
  }

  private async createEvent(event: Event): Promise<Event> {
    return this.hormoniosRepository.createEvent(event);
  }

  private async sync(event: Event): Promise<Event> {
    const shouldSync = this.shouldSync(event);

    if (!shouldSync) {
      return event;
    }

    const now = new Date();
    const integrationStatus = await this.findIntegrationStatus(event, now);

    if (!event.date) {
      const errorCtx = new ErrorCtx(0, null, null, "Event date is not defined");
      const pending = integrationStatus.pending(errorCtx, now);

      return this.saveFailure(event, pending);
    }

    try {
      const external = await this.transicionaisRepo.createEvent(event);

      return await this.saveSynced(event, external, integrationStatus, now);
    } catch (error) {
      const failed = this.toFailedStatus(integrationStatus, error, now);

      return this.saveFailure(event, failed);
    }
  }

  private shouldSync(event: Event): boolean {
    const { integrationId, sync } = event.metadata;
    const done = sync === SyncStatus.Synced || sync === SyncStatus.ManualRetry;

    return integrationId === null && !done;
  }

  private async findIntegrationStatus(event: Event, now: Date): Promise<IntegrationStatus> {
    const found = await this.hormoniosRepository.findIntegrationStatus(IntegrationEntity.Event, event.id);

    return found ?? IntegrationStatus.create(IntegrationEntity.Event, event.id, now);
  }

  private toFailedStatus(integrationStatus: IntegrationStatus, error: unknown, now: Date): IntegrationStatus {
    const errorCtx = toErrorCtx(error);

    if (error instanceof UpstreamUnavailableError) {
      return integrationStatus.pending(errorCtx, now);
    }

    logger.error({ err: error, hormoniosEventId: integrationStatus.entityId }, "event rejected by Transicionais");

    return integrationStatus.manualRetry(errorCtx, now);
  }

  private async saveSynced(event: Event, external: Event, integrationStatus: IntegrationStatus, now: Date): Promise<Event> {
    const json = event.toJson();
    const externalMetadata = external.metadata.toJson();
    const metadata = { ...externalMetadata, sync: SyncStatus.Synced, syncError: null };
    const synced = EventMapper.fromData({ ...json, metadata });
    const status = integrationStatus.synced(now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(status);

    return this.hormoniosRepository.updateEvent(synced);
  }

  private async saveFailure(event: Event, integrationStatus: IntegrationStatus): Promise<Event> {
    const json = event.toJson();
    const errorCtx = integrationStatus.errorCtx;
    const syncError = errorCtx ? errorCtx.key ?? errorCtx.message : null;
    const metadata = { ...json.metadata, sync: integrationStatus.status, syncError };
    const failed = EventMapper.fromData({ ...json, metadata });

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(integrationStatus);

    return this.hormoniosRepository.updateEvent(failed);
  }
}
