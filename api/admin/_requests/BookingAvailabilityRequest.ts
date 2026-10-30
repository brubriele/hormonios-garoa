import { type Event, EventVisibility } from "../../../src/bff/domain/Event";
import { EventMapper, type IEventMetadataData } from "../../../src/bff/domain/mappers/EventMapper";
import { SyncStatus } from "../../../src/bff/domain/SyncStatus";

export interface IBookingAvailabilityRequest {
  isActive: boolean;
}

// spec-8 B7
export class BookingAvailabilityRequest {
  static toDomain(body: IBookingAvailabilityRequest): Event {
    const metadata = BookingAvailabilityRequest.toMetadata();

    return EventMapper.fromData({
      id: "",
      location: "",
      whatsappUrl: null,
      date: "",
      startTime: null,
      isActive: body.isActive,
      groups: [],
      catalog: [],
      metadata,
    });
  }

  private static toMetadata(): IEventMetadataData {
    const description = { visibility: EventVisibility.Private, description: null, releaseAt: null, membersEarlyAt: null, totalVacancies: null };

    return {
      externalPublicId: null,
      integrationId: null,
      transicionaisDayId: null,
      name: "",
      categoryId: null,
      endTime: null,
      description,
      version: null,
      fetchedAt: null,
      sync: SyncStatus.Pending,
      syncError: null,
      syncHash: null,
      syncedAt: null,
    };
  }
}
