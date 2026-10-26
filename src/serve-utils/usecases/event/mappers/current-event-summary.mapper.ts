// Resumo da Produção: o ensaio (CurrentEvent) com o estoque e as reservas (Booking) -> CurrentEventSummary.
// Só formata: a conta das vagas é dos models (Group e Support)
import { AdminBooking } from "../../../models/admin-booking";
import { AdminEvent } from "../../../models/admin-event";
import { CurrentEventSummary } from "../../../models/current-event-summary";
import type { Booking } from "../../../models/booking";
import type { CurrentEvent, Group, Support } from "../../../models/current-event";
import { StockItem } from "../../../models/stock-item";
import { StockBooking } from "../../../models/stock-booking";
import { SupportTypeKind } from "../../../models/support-type";

const NO_ACCESSORIES = "Sem acessórios";

export class CurrentEventSummaryMapper {
  // estoque: instrumentos primeiro, depois acessórios, na ordem do Transicionais
  static toView(event: CurrentEvent, bookings: Booking[]): CurrentEventSummary {
    const going = event.goingBookings(bookings);
    const stock = [
      ...event.groups.flatMap((group) => CurrentEventSummaryMapper.toInstrumentStock(event, group, bookings, going)),
      ...event.supports.map((support) => CurrentEventSummaryMapper.toAccessoryStock(event, support, bookings, going)),
    ];

    return new CurrentEventSummary(
      new AdminEvent(
        event.dayKey,
        event.date,
        event.time,
        event.location,
        event.bookingOpen,
        event.whatsappUrl,
        going.length,
        stock,
      ),
      going.map((booking) => CurrentEventSummaryMapper.toBooking(booking)),
    );
  }

  // instrumento: a assistência do grupo; grupo sem instrumentSupportId fica de fora
  private static toInstrumentStock(
    event: CurrentEvent,
    group: Group,
    bookings: Booking[],
    going: Booking[],
  ): StockItem[] {
    if (group.instrumentSupportId === null) {
      return [];
    }

    return [
      new StockItem(
        group.instrumentSupportId,
        group.name,
        SupportTypeKind.Instrument,
        group.stockTotal,
        group.available(bookings),
        group.rotativo,
        going
          .filter((booking) => booking.groupId === group.id)
          .map((booking) =>
            CurrentEventSummaryMapper.toStockBooking(booking, CurrentEventSummaryMapper.toAccessoryNames(event, booking)),
          ),
      ),
    ];
  }

  private static toAccessoryStock(
    event: CurrentEvent,
    support: Support,
    bookings: Booking[],
    going: Booking[],
  ): StockItem {
    return new StockItem(
      support.id,
      support.name,
      SupportTypeKind.Accessory,
      support.stockTotal,
      support.available(bookings),
      support.rotativo,
      going
        .filter((booking) => booking.supportIds.includes(support.id))
        .map((booking) =>
          CurrentEventSummaryMapper.toStockBooking(booking, CurrentEventSummaryMapper.toGroupName(event, booking)),
        ),
    );
  }

  private static toAccessoryNames(event: CurrentEvent, booking: Booking): string {
    const names = [...new Set(booking.supportIds)]
      .map((supportId) => event.findSupport(supportId)?.name)
      .filter((name): name is string => name !== undefined);

    return names.length > 0 ? names.join(" · ") : NO_ACCESSORIES;
  }

  private static toGroupName(event: CurrentEvent, booking: Booking): string {
    return booking.groupId === null ? "" : event.findGroup(booking.groupId)?.name ?? "";
  }

  private static toStockBooking(booking: Booking, detail: string): StockBooking {
    return new StockBooking(booking.user.name, booking.user.pronoun, detail);
  }

  private static toBooking(booking: Booking): AdminBooking {
    return new AdminBooking(
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
