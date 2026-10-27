import type { Event } from "../../../src/serve-utils/domain/Event";
import {
  EventMapper,
  type IEventCatalogData,
  type IEventCatalogMetadataData,
  type IEventDescriptionData,
  type IEventGroupData,
  type IEventMetadataData,
} from "../../../src/serve-utils/domain/mappers/EventMapper";
import { SyncStatus } from "../../../src/serve-utils/domain/SyncStatus";

export interface IEventRequestCatalog {
  id: string;
  name: string;
  stock: { total: number | null; rotative: boolean };
  metadata: IEventCatalogMetadataData;
}

export interface IEventRequestMetadata {
  name: string;
  categoryId: string | null;
  endTime: string | null;
  description: IEventDescriptionData;
}

export interface IEventRequest {
  id?: string;
  location: string;
  whatsappUrl: string;
  date: string;
  startTime: string | null;
  bookingOpen: boolean;
  groups: IEventGroupData[];
  catalog: IEventRequestCatalog[];
  metadata: IEventRequestMetadata;
}

export class EventRequest {
  static toDomain(body: IEventRequest): Event {
    const catalog = body.catalog.map((item) => EventRequest.toCatalog(item));
    const metadata = EventRequest.toMetadata(body.metadata);
    const id = body.id ?? "";

    return EventMapper.fromData({ ...body, id, catalog, metadata });
  }

  private static toCatalog(item: IEventRequestCatalog): IEventCatalogData {
    const stock = { total: item.stock.total, rotative: item.stock.rotative, used: 0 };

    return { id: item.id, name: item.name, stock, metadata: item.metadata };
  }

  private static toMetadata(metadata: IEventRequestMetadata): IEventMetadataData {
    return {
      externalPublicId: null,
      integrationId: null,
      transicionaisDayId: null,
      name: metadata.name,
      categoryId: metadata.categoryId,
      endTime: metadata.endTime,
      description: metadata.description,
      version: null,
      fetchedAt: null,
      sync: SyncStatus.Pending,
      syncError: null,
      syncHash: null,
      syncedAt: null,
    };
  }
}
