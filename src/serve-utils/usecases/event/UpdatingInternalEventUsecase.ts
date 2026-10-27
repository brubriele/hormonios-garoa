import { z } from "zod";
import type { Attendance } from "../../domain/Attendance";
import { Event, type EventCatalog, type EventMetadata } from "../../domain/Event";
import { ManagerEvent } from "../../domain/ManagerEvent";
import { EventMapper, type IEventCatalogData, type IEventMetadataData } from "../../domain/mappers/EventMapper";
import type { User } from "../../domain/User";
import { AppError, InvalidParameterError, NotFoundError, StockBelowReservationsError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { EventBodySchema } from "./CreatingInternalEventUsecase";

const logger = createLogger("UpdatingInternalEventUsecase");

const UpdatingInternalEventInputSchema = z.instanceof(Event);

export class UpdatingInternalEventUsecase {
  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(data: Event): Promise<ManagerEvent> {
    try {
      return await this._execute(data);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // D13, F10
  private async _execute(data: Event): Promise<ManagerEvent> {
    const valid = this.validateInput(data);
    const current = await this.findEvent(valid);
    const attendances = await this.findEventAttendance(current);
    const event = this.mergeEvent(valid, current);

    this.validateAttendancesKept(event, attendances);
    this.validateStockAboveReservations(event, attendances);

    const updated = await this.updateEvent(event);
    const users = await this.findEventUsers(updated);
    const updatedAttendances = await this.findEventAttendance(updated);
    const counted = updated.withAttendances(updatedAttendances, true);

    return new ManagerEvent(counted, users);
  }

  private validateInput(data: Event): Event {
    const event = validateSchema(UpdatingInternalEventInputSchema, data);
    const json = event.toJson();

    validateSchema(EventBodySchema, json);

    return event;
  }

  private async findEvent(data: Event): Promise<Event> {
    const event = await this.findEventByIdOrIntegrationId(data);

    if (!event) {
      throw new NotFoundError("Event Not Found");
    }

    return event;
  }

  private async findEventByIdOrIntegrationId(data: Event): Promise<Event | null> {
    const integrationId = data.metadata.integrationId;

    if (data.id) {
      return this.hormoniosRepository.findEvent(data.id);
    }

    if (integrationId === null) {
      return null;
    }

    return this.hormoniosRepository.findEventByIntegrationId(integrationId);
  }

  private async findEventAttendance(data: Event): Promise<Attendance[]> {
    return this.hormoniosRepository.findEventAttendance(data);
  }

  private mergeEvent(data: Event, current: Event): Event {
    const json = data.toJson();
    const whatsappUrl = data.whatsappUrl ?? current.whatsappUrl;
    const bookingOpen = data.bookingOpen ?? current.bookingOpen;
    const catalog = data.catalog.map((item) => this.mergeCatalog(item, current));
    const metadata = this.mergeMetadata(data.metadata, current);

    return EventMapper.fromData({ ...json, id: current.id, whatsappUrl, bookingOpen, catalog, metadata });
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

  private async findEventUsers(event: Event): Promise<User[]> {
    return this.hormoniosRepository.findEventUsers(event);
  }
}
