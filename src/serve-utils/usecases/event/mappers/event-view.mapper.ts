// GET /api/ensaio: o ensaio (CurrentEvent) com as vagas pelas reservas (Booking) -> EventView. Só
// formata: a conta das vagas é dos models (Group e Support)
import type { Booking } from "../../../models/booking";
import type { CurrentEvent, Group, Support } from "../../../models/current-event";
import { EventAccessory } from "../../../models/event-accessory";
import { EventInstrument } from "../../../models/event-instrument";
import { EventView } from "../../../models/event-view";

export class EventViewMapper {
  // só grupos ativos, cada um com os acessórios que valem para ele
  static toView(event: CurrentEvent, bookings: Booking[], stale: boolean): EventView {
    return new EventView(
      event.dayKey,
      event.date,
      event.time,
      event.location,
      event.bookingOpen,
      event.whatsappUrl,
      event.goingBookings(bookings).length,
      event.groups
        .filter((group) => group.active)
        .map((group) => EventViewMapper.toInstrument(event, group, bookings)),
      stale,
      event.fetchedAt,
    );
  }

  private static toInstrument(event: CurrentEvent, group: Group, bookings: Booking[]): EventInstrument {
    return new EventInstrument(
      group.id,
      group.name,
      group.stockTotal,
      group.available(bookings),
      group.soldOut(bookings),
      event.supportsForGroup(group.id).map((support) => EventViewMapper.toAccessory(support, bookings)),
    );
  }

  private static toAccessory(support: Support, bookings: Booking[]): EventAccessory {
    return new EventAccessory(support.id, support.name, support.available(bookings), support.soldOut(bookings));
  }
}
