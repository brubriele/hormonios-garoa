// Resumo da Produção: o ensaio (CurrentEvent) com o estoque e as reservas (Attendance) -> AdminSummary.
// Só formata: a conta das vagas é dos models (Group e Support)
import { AdminAttendance } from "../../models/admin-attendance";
import { AdminEvent } from "../../models/admin-event";
import { AdminSummary } from "../../models/admin-summary";
import type { Attendance } from "../../models/attendance";
import type { CurrentEvent, Group, Support } from "../../models/current-event";
import { StockItem } from "../../models/stock-item";
import { StockReservation } from "../../models/stock-reservation";
import { SupportTypeKind } from "../../models/support-type";

const NO_ACCESSORIES = "Sem acessórios";

export class AdminSummaryMapper {
  // estoque: instrumentos primeiro, depois acessórios, na ordem do Transicionais
  static toView(event: CurrentEvent, attendances: Attendance[]): AdminSummary {
    const going = event.goingAttendances(attendances);
    const stock = [
      ...event.groups.flatMap((group) => AdminSummaryMapper.toInstrumentStock(event, group, attendances, going)),
      ...event.supports.map((support) => AdminSummaryMapper.toAccessoryStock(event, support, attendances, going)),
    ];

    return new AdminSummary(
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
      going.map((attendance) => AdminSummaryMapper.toAttendance(attendance)),
    );
  }

  // instrumento: a assistência do grupo; grupo sem instrumentSupportId fica de fora
  private static toInstrumentStock(
    event: CurrentEvent,
    group: Group,
    attendances: Attendance[],
    going: Attendance[],
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
        group.available(attendances),
        group.rotativo,
        going
          .filter((attendance) => attendance.groupId === group.id)
          .map((attendance) =>
            AdminSummaryMapper.toReservation(attendance, AdminSummaryMapper.toAccessoryNames(event, attendance)),
          ),
      ),
    ];
  }

  private static toAccessoryStock(
    event: CurrentEvent,
    support: Support,
    attendances: Attendance[],
    going: Attendance[],
  ): StockItem {
    return new StockItem(
      support.id,
      support.name,
      SupportTypeKind.Accessory,
      support.stockTotal,
      support.available(attendances),
      support.rotativo,
      going
        .filter((attendance) => attendance.supportIds.includes(support.id))
        .map((attendance) =>
          AdminSummaryMapper.toReservation(attendance, AdminSummaryMapper.toGroupName(event, attendance)),
        ),
    );
  }

  private static toAccessoryNames(event: CurrentEvent, attendance: Attendance): string {
    const names = [...new Set(attendance.supportIds)]
      .map((supportId) => event.findSupport(supportId)?.name)
      .filter((name): name is string => name !== undefined);

    return names.length > 0 ? names.join(" · ") : NO_ACCESSORIES;
  }

  private static toGroupName(event: CurrentEvent, attendance: Attendance): string {
    return attendance.groupId === null ? "" : event.findGroup(attendance.groupId)?.name ?? "";
  }

  private static toReservation(attendance: Attendance, detail: string): StockReservation {
    return new StockReservation(attendance.user.name, attendance.user.pronoun, detail);
  }

  private static toAttendance(attendance: Attendance): AdminAttendance {
    return new AdminAttendance(
      attendance.id,
      attendance.user.name,
      attendance.user.pronoun,
      attendance.groupId,
      attendance.supportIds,
      attendance.createdAt,
      attendance.sync,
    );
  }
}
