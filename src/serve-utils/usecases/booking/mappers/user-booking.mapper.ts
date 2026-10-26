// "Minhas reservas": a reserva (Booking) com os nomes do ensaio (CurrentEvent) -> UserBooking.
// Só formata
import { type Booking, BookingSync } from "../../../models/booking";
import type { CurrentEvent } from "../../../models/current-event";
import { UserBooking } from "../../../models/user-booking";
import { UserBookingAccessory } from "../../../models/user-booking-accessory";

export class UserBookingMapper {
  static toView(event: CurrentEvent, booking: Booking): UserBooking {
    return new UserBooking(
      booking.id,
      booking.groupId,
      booking.groupId === null ? null : event.findInstrument(booking.groupId)?.name ?? null,
      booking.supportIds,
      event.accessories
        .filter((accessory) => booking.supportIds.includes(accessory.id))
        .map((accessory) => new UserBookingAccessory(accessory.id, accessory.name)),
      booking.user.email,
      booking.user.name,
      booking.user.pronoun,
      booking.sync,
      booking.sync === BookingSync.Rejected ? booking.syncError : null,
    );
  }
}
