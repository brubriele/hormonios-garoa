import type { Event, EventCatalogType } from "../../../src/serve-utils/domain/Event";
import {
  EventMapper,
  type IEventCatalogData,
  type IEventDescriptionData,
  type IEventGroupData,
  type IEventMetadataData,
} from "../../../src/serve-utils/domain/mappers/EventMapper";
import { SyncStatus } from "../../../src/serve-utils/domain/SyncStatus";

export interface IEventRequestGroup {
  id: string;
  name: string;
  active: boolean;
}

export interface IEventRequestCatalog {
  id: string;
  name: string;
  type: EventCatalogType;
  groupIds: string[];
  stock: { total: number | null; rotative: boolean };
}

export interface IEventRequest {
  id?: string;
  name: string;
  location: string;
  whatsappUrl: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  bookingOpen: boolean | null;
  categoryId: string | null;
  description: IEventDescriptionData;
  groups: IEventRequestGroup[];
  catalog: IEventRequestCatalog[];
}

export class EventRequest {
  static toDomain(body: IEventRequest): Event {
    const groups = body.groups.map((group) => EventRequest.toGroup(group));
    const catalog = body.catalog.map((item) => EventRequest.toCatalog(item));
    const metadata = EventRequest.toMetadata(body);
    const id = body.id ?? "";

    return EventMapper.fromData({
      id,
      location: body.location,
      whatsappUrl: body.whatsappUrl,
      date: body.date,
      startTime: body.startTime,
      bookingOpen: body.bookingOpen,
      groups,
      catalog,
      metadata,
    });
  }

  private static toGroup(group: IEventRequestGroup): IEventGroupData {
    return { id: group.id, name: group.name, metadata: { active: group.active, exclusiveCapacity: null } };
  }

  private static toCatalog(item: IEventRequestCatalog): IEventCatalogData {
    const stock = { total: item.stock.total, rotative: item.stock.rotative, used: 0 };

    return { id: item.id, name: item.name, stock, metadata: { groupIds: item.groupIds, type: item.type } };
  }

  private static toMetadata(body: IEventRequest): IEventMetadataData {
    return {
      externalPublicId: null,
      integrationId: null,
      transicionaisDayId: null,
      name: body.name,
      categoryId: body.categoryId,
      endTime: body.endTime,
      description: body.description,
      version: null,
      fetchedAt: null,
      sync: SyncStatus.Pending,
      syncError: null,
      syncHash: null,
      syncedAt: null,
    };
  }
}
