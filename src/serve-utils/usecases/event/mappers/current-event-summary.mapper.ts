// Resumo da Produção: o ensaio (CurrentEvent) com o estoque e as reservas (Booking) -> CurrentEventSummary.
// Só formata: a conta das vagas é dos models (Instrument e Accessory)
import { SummaryAttendance } from "../../../models/summary-attendance";
import { SummaryEvent } from "../../../models/summary-event";
import { CurrentEventSummary } from "../../../models/current-event-summary";
import type { Booking } from "../../../models/booking";
import type { CurrentEvent, Instrument, Accessory } from "../../../models/current-event";
import { SummaryStockItem } from "../../../models/summary-stock-item";
import { SummaryStockBooking } from "../../../models/summary-stock-booking";
import { LoanCatalogKind } from "../../../models/loan-catalog";

const NO_ACCESSORIES = "Sem acessórios";

export class CurrentEventSummaryMapper {
  // estoque: instrumentos primeiro, depois acessórios, na ordem do Transicionais
  static toView(event: CurrentEvent, bookings: Booking[]): CurrentEventSummary {
    const going = event.goingBookings(bookings);
    const stock = [
      ...event.instruments.flatMap((instrument) => CurrentEventSummaryMapper.toInstrumentStock(event, instrument, bookings, going)),
      ...event.accessories.map((accessory) => CurrentEventSummaryMapper.toAccessoryStock(event, accessory, bookings, going)),
    ];

    return new CurrentEventSummary(
      new SummaryEvent(
        event.dayKey,
        event.date,
        event.time,
        event.location,
        event.bookingOpen,
        event.whatsappUrl,
        going.length,
        stock,
      ),
      going.map((booking) => CurrentEventSummaryMapper.toAttendance(booking)),
    );
  }

  // instrumento: a assistência do grupo; grupo sem instrumentSupportId fica de fora
  private static toInstrumentStock(
    event: CurrentEvent,
    instrument: Instrument,
    bookings: Booking[],
    going: Booking[],
  ): SummaryStockItem[] {
    if (instrument.instrumentSupportId === null) {
      return [];
    }

    return [
      new SummaryStockItem(
        instrument.instrumentSupportId,
        instrument.name,
        LoanCatalogKind.Instrument,
        instrument.stockTotal,
        instrument.available(bookings),
        instrument.rotativo,
        going
          .filter((booking) => booking.groupId === instrument.id)
          .map((booking) =>
            CurrentEventSummaryMapper.toSummaryStockBooking(booking, CurrentEventSummaryMapper.toAccessoryNames(event, booking)),
          ),
      ),
    ];
  }

  private static toAccessoryStock(
    event: CurrentEvent,
    accessory: Accessory,
    bookings: Booking[],
    going: Booking[],
  ): SummaryStockItem {
    return new SummaryStockItem(
      accessory.id,
      accessory.name,
      LoanCatalogKind.Accessory,
      accessory.stockTotal,
      accessory.available(bookings),
      accessory.rotativo,
      going
        .filter((booking) => booking.supportIds.includes(accessory.id))
        .map((booking) =>
          CurrentEventSummaryMapper.toSummaryStockBooking(booking, CurrentEventSummaryMapper.toInstrumentName(event, booking)),
        ),
    );
  }

  private static toAccessoryNames(event: CurrentEvent, booking: Booking): string {
    const names = [...new Set(booking.supportIds)]
      .map((supportId) => event.findAccessory(supportId)?.name)
      .filter((name): name is string => name !== undefined);

    return names.length > 0 ? names.join(" · ") : NO_ACCESSORIES;
  }

  private static toInstrumentName(event: CurrentEvent, booking: Booking): string {
    return booking.groupId === null ? "" : event.findInstrument(booking.groupId)?.name ?? "";
  }

  private static toSummaryStockBooking(booking: Booking, detail: string): SummaryStockBooking {
    return new SummaryStockBooking(booking.user.name, booking.user.pronoun, detail);
  }

  private static toAttendance(booking: Booking): SummaryAttendance {
    return new SummaryAttendance(
      booking.id,
      booking.user.name,
      booking.user.pronoun,
      booking.groupId,
      booking.supportIds,
      booking.createdAt,
      booking.sync,
    );
  }
}
