// GET /api/ensaio: o ensaio (CurrentEvent) com as vagas pelas reservas (Attendance) -> EventView. Só
// formata: a conta das vagas é dos models (Group e Support)
import type { Attendance } from "../../models/attendance";
import type { CurrentEvent, Group, Support } from "../../models/current-event";
import { EventAccessory } from "../../models/event-accessory";
import { EventInstrument } from "../../models/event-instrument";
import { EventView } from "../../models/event-view";

export class EventViewMapper {
  // só grupos ativos, cada um com os acessórios que valem para ele
  static toView(event: CurrentEvent, attendances: Attendance[], stale: boolean): EventView {
    return new EventView(
      event.dayKey,
      event.date,
      event.time,
      event.location,
      event.bookingOpen,
      event.whatsappUrl,
      event.goingAttendances(attendances).length,
      event.groups
        .filter((group) => group.active)
        .map((group) => EventViewMapper.toInstrument(event, group, attendances)),
      stale,
      event.fetchedAt,
    );
  }

  private static toInstrument(event: CurrentEvent, group: Group, attendances: Attendance[]): EventInstrument {
    return new EventInstrument(
      group.id,
      group.name,
      group.stockTotal,
      group.available(attendances),
      group.soldOut(attendances),
      event.supportsForGroup(group.id).map((support) => EventViewMapper.toAccessory(support, attendances)),
    );
  }

  private static toAccessory(support: Support, attendances: Attendance[]): EventAccessory {
    return new EventAccessory(support.id, support.name, support.available(attendances), support.soldOut(attendances));
  }
}
