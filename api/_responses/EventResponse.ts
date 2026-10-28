import type { Event, EventCatalog, EventGroup } from "../../src/serve-utils/domain/Event";

export class EventResponse {
  static fromDomain(event: Event) {
    return {
      id: event.id,
      name: event.name,
      location: event.location,
      whatsappUrl: event.whatsappUrl,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      bookingOpen: event.bookingOpen,
      goingCount: event.goingCount,
      categoryId: event.categoryId,
      description: event.description.toJson(),
      integrationId: event.integrationId,
      externalPublicId: event.metadata.externalPublicId,
      groups: event.groups.map((group) => EventResponse.toGroup(group)),
      catalog: event.catalog.map((item) => EventResponse.toCatalog(item)),
    };
  }

  private static toGroup(group: EventGroup) {
    return { id: group.id, name: group.name, active: group.active, capacity: group.capacity };
  }

  private static toCatalog(item: EventCatalog) {
    return { id: item.id, name: item.name, type: item.type, groupIds: item.groupIds, stock: item.stock.toJson() };
  }
}
