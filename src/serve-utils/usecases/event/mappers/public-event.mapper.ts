// GET /api/ensaio: o ensaio (CurrentEvent) com as vagas pelas reservas (Booking) -> PublicEvent. Só
// formata: a conta das vagas é dos models (Instrument e Accessory)
import type { Booking } from "../../../models/booking";
import type { CurrentEvent, Instrument, Accessory } from "../../../models/current-event";
import { PublicAccessory } from "../../../models/public-accessory";
import { PublicInstrument } from "../../../models/public-instrument";
import { PublicEvent } from "../../../models/public-event";

export class PublicEventMapper {
  // só grupos ativos, cada um com os acessórios que valem para ele
  static toView(event: CurrentEvent, bookings: Booking[], stale: boolean): PublicEvent {
    return new PublicEvent(
      event.dayKey,
      event.date,
      event.time,
      event.location,
      event.bookingOpen,
      event.whatsappUrl,
      event.goingBookings(bookings).length,
      event.instruments
        .filter((instrument) => instrument.active)
        .map((instrument) => PublicEventMapper.toInstrument(event, instrument, bookings)),
      stale,
      event.fetchedAt,
    );
  }

  private static toInstrument(event: CurrentEvent, instrument: Instrument, bookings: Booking[]): PublicInstrument {
    return new PublicInstrument(
      instrument.id,
      instrument.name,
      instrument.stockTotal,
      instrument.available(bookings),
      instrument.soldOut(bookings),
      event.accessoriesForInstrument(instrument.id).map((accessory) => PublicEventMapper.toAccessory(accessory, bookings)),
    );
  }

  private static toAccessory(accessory: Accessory, bookings: Booking[]): PublicAccessory {
    return new PublicAccessory(accessory.id, accessory.name, accessory.available(bookings), accessory.soldOut(bookings));
  }
}
