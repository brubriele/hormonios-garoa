import { z } from "zod";
import type { Attendance } from "../../domain/Attendance";
import { Event, type EventCatalog, type EventGroup, type EventMetadata } from "../../domain/Event";
import { EventPosition, FindingInternalFilter } from "../../domain/FindingInternalFilter";
import { IntegrationEntity, IntegrationStatus } from "../../domain/IntegrationStatus";
import { ManagerEvent } from "../../domain/ManagerEvent";
import { EventMapper, type IEventCatalogData, type IEventGroupData, type IEventMetadataData } from "../../domain/mappers/EventMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import {
  AppError,
  InvalidParameterError,
  NotFoundError,
  StockBelowReservationsError,
  UpstreamUnavailableError,
} from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { toErrorCtx } from "../../lib/upstream";
import { EventBodySchema } from "./CreatingInternalEventUsecase";
import type { FindingInternalEventUsecase } from "./FindingInternalEventUsecase";

const logger = createLogger("UpdatingInternalEventUsecase", LogContext.Event);

const UpdatingInternalEventInputSchema = z.instanceof(Event);

export class UpdatingInternalEventUsecase {
  static readonly token = "UpdatingInternalEventUsecase";

  constructor(
    private readonly hormoniosRepository: IHormoniosRepository,
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly findingInternalEventUsecase: FindingInternalEventUsecase,
  ) {}

  async execute(data: Event): Promise<ManagerEvent> {
    try {
      const managerEvent = await this._execute(data);

      return managerEvent;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error, { hormoniosEventId: data.id });
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // D13, F10, spec-8 D3
  private async _execute(data: Event): Promise<ManagerEvent> {
    logger.track("updating internal event", { hormoniosEventId: data.id });

    const valid = this.validateInput(data);
    const found = await this.findManagerEvent(valid);
    const attendances = this.toAttendances(found);
    const event = this.mergeEvent(valid, found.event);

    this.validateAttendancesKept(event, attendances);
    this.validateStockAboveReservations(event, attendances);

    const saved = await this.updateEvent(event);
    const updated = await this.sync(saved);
    const counted = updated.withAttendances(attendances, true);

    return new ManagerEvent(counted, found.users);
  }

  private validateInput(data: Event): Event {
    const event = validateSchema(UpdatingInternalEventInputSchema, data);
    const json = event.toJson();

    validateSchema(EventBodySchema, json);

    return event;
  }

  // spec-8 D3: o encontro pelo id (ou integrationId, no webhook), sem olhar o atual
  private async findManagerEvent(data: Event): Promise<ManagerEvent> {
    const integrationId = data.metadata.integrationId ?? undefined;
    const filter = data.id ? new FindingInternalFilter({ eventId: data.id }) : new FindingInternalFilter({ integrationId });
    const found = await this.findingInternalEventUsecase.execute(filter);

    return found;
  }

  private toAttendances(managerEvent: ManagerEvent): Attendance[] {
    return managerEvent.users.flatMap((user) => user.attendances);
  }

  private mergeEvent(data: Event, current: Event): Event {
    const json = data.toJson();
    const whatsappUrl = data.whatsappUrl ?? current.whatsappUrl;
    const groups = data.groups.map((group) => this.mergeGroup(group, current));
    const catalog = data.catalog.map((item) => this.mergeCatalog(item, current));
    const metadata = this.mergeMetadata(data.metadata, current);

    return EventMapper.fromData({ ...json, id: current.id, whatsappUrl, isActive: current.isActive, groups, catalog, metadata });
  }

  private mergeGroup(group: EventGroup, current: Event): IEventGroupData {
    const currentGroup = current.groups.find((entry) => entry.id === group.id);
    const currentCapacity = currentGroup ? currentGroup.metadata.exclusiveCapacity : null;
    const exclusiveCapacity = group.metadata.exclusiveCapacity ?? currentCapacity;
    const metadata = { active: group.metadata.active, exclusiveCapacity };

    return { id: group.id, name: group.name, metadata };
  }

  private mergeCatalog(item: EventCatalog, current: Event): IEventCatalogData {
    const currentItem = current.catalog.find((entry) => entry.id === item.id);
    const used = currentItem ? currentItem.stock.used : 0;
    const json = item.toJson();

    return { ...json, stock: { total: item.stock.total, rotative: item.stock.rotative, used } };
  }

  private mergeMetadata(metadata: EventMetadata, current: Event): IEventMetadataData {
    const currentMetadata = current.metadata;
    const json = metadata.toJson();

    return {
      ...json,
      externalPublicId: metadata.externalPublicId ?? currentMetadata.externalPublicId,
      integrationId: metadata.integrationId ?? currentMetadata.integrationId,
      transicionaisDayId: metadata.transicionaisDayId ?? currentMetadata.transicionaisDayId,
      version: metadata.version ?? currentMetadata.version,
      fetchedAt: metadata.fetchedAt ?? currentMetadata.fetchedAt,
      syncHash: metadata.syncHash ?? currentMetadata.syncHash,
      syncedAt: metadata.syncedAt ?? currentMetadata.syncedAt,
    };
  }

  private validateAttendancesKept(event: Event, attendances: Attendance[]): void {
    const groupIds = event.groups.map((group) => group.id);
    const catalogIds = event.catalog.map((item) => item.id);

    for (const attendance of attendances) {
      const groupId = attendance.eventGroup ? attendance.eventGroup.id : null;

      if (groupId !== null && !groupIds.includes(groupId)) {
        throw new InvalidParameterError(`Field groups must keep group ${groupId}`);
      }

      const missing = attendance.catalog.find((item) => !catalogIds.includes(item.id));

      if (missing) {
        throw new InvalidParameterError(`Field catalog must keep item ${missing.id}`);
      }
    }
  }

  // F4
  private validateStockAboveReservations(event: Event, attendances: Attendance[]): void {
    const counted = event.withAttendances(attendances, true);

    for (const item of counted.catalog) {
      if (item.stock.total === null || item.stock.rotative) {
        continue;
      }

      if (item.stock.total < item.stock.used) {
        throw new StockBelowReservationsError(`Stock of ${item.id} is below reservations`);
      }
    }
  }

  private async updateEvent(event: Event): Promise<Event> {
    return this.hormoniosRepository.updateEvent(event);
  }

  // spec-4 C3, fase-2 E1–E5
  private async sync(event: Event): Promise<Event> {
    const shouldSync = this.shouldSync(event);

    if (!shouldSync) {
      return event;
    }

    const now = new Date();
    const integrationStatus = await this.findIntegrationStatus(event, now);

    try {
      const external = await this.transicionaisRepo.updateEvent(event);
      const saved = await this.saveSynced(event, external, integrationStatus, now);

      return saved;
    } catch (error) {
      const failed = this.toFailedStatus(integrationStatus, error, now);

      return this.saveFailure(event, failed);
    }
  }

  // spec-4 C3
  private shouldSync(event: Event): boolean {
    const { integrationId, sync } = event.metadata;

    return integrationId !== null && sync !== SyncStatus.Synced;
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
