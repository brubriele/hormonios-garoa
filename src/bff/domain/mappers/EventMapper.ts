import {
  Event,
  EventCatalog,
  EventCatalogMetadata,
  EventCatalogStock,
  type EventCatalogType,
  EventDescription,
  EventGroup,
  EventGroupMetadata,
  EventMetadata,
  type EventVisibility,
} from "../Event";
import type { SyncStatus } from "../SyncStatus";

export interface IEventGroupMetadataData {
  active: boolean;
  exclusiveCapacity: number | null;
}

export interface IEventGroupData {
  id: string;
  name: string;
  metadata: IEventGroupMetadataData;
}

export interface IEventCatalogStockData {
  total: number | null;
  rotative: boolean;
  used: number;
}

export interface IEventCatalogMetadataData {
  groupIds: string[];
  type: EventCatalogType;
}

export interface IEventCatalogData {
  id: string;
  name: string;
  stock: IEventCatalogStockData;
  metadata: IEventCatalogMetadataData;
}

export interface IEventDescriptionData {
  visibility: EventVisibility;
  description: string | null;
  releaseAt: string | null;
  membersEarlyAt: string | null;
  totalVacancies: number | null;
}

export interface IEventMetadataData {
  externalPublicId: string | null;
  integrationId: number | null;
  transicionaisDayId: number | null;
  name: string;
  categoryId: string | null;
  endTime: string | null;
  description: IEventDescriptionData;
  version: number | null;
  fetchedAt: string | null;
  sync: SyncStatus;
  syncError: string | null;
  syncHash: string | null;
  syncedAt: string | null;
}

export interface IEventData {
  id: string;
  location: string;
  whatsappUrl: string | null;
  date: string;
  startTime: string | null;
  isActive: boolean;
  groups: IEventGroupData[];
  catalog: IEventCatalogData[];
  metadata: IEventMetadataData;
}

// M11
export class EventMapper {
  static fromData(data: IEventData): Event {
    const groups = data.groups.map((group) => EventMapper.toGroup(group));
    const catalog = data.catalog.map((item) => EventMapper.toCatalog(item));
    const metadata = EventMapper.toMetadata(data.metadata);

    return new Event(data.id, data.location, data.whatsappUrl, data.date, data.startTime, data.isActive, groups, catalog, metadata);
  }

  private static toGroup(group: IEventGroupData): EventGroup {
    const metadata = new EventGroupMetadata(group.metadata.active, group.metadata.exclusiveCapacity);

    return new EventGroup(group.id, group.name, metadata);
  }

  private static toCatalog(item: IEventCatalogData): EventCatalog {
    const stock = new EventCatalogStock(item.stock.total, item.stock.rotative, item.stock.used);
    const metadata = new EventCatalogMetadata(item.metadata.groupIds, item.metadata.type);

    return new EventCatalog(item.id, item.name, stock, metadata);
  }

  private static toMetadata(metadata: IEventMetadataData): EventMetadata {
    const { description } = metadata;
    const eventDescription = new EventDescription(
      description.visibility,
      description.description,
      description.releaseAt,
      description.membersEarlyAt,
      description.totalVacancies,
    );

    return new EventMetadata(
      metadata.externalPublicId,
      metadata.integrationId,
      metadata.transicionaisDayId,
      metadata.name,
      metadata.categoryId,
      metadata.endTime,
      eventDescription,
      metadata.version,
      metadata.fetchedAt,
      metadata.sync,
      metadata.syncError,
      metadata.syncHash,
      metadata.syncedAt,
    );
  }
}
