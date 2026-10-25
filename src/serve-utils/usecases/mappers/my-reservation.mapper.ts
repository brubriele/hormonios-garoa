// "Minhas reservas": a reserva (Attendance) com os nomes do ensaio (CurrentEvent) -> MyReservation.
// Só formata
import { type Attendance, AttendanceSync } from "../../models/attendance";
import type { CurrentEvent } from "../../models/current-event";
import { MyReservation } from "../../models/my-reservation";
import { MyReservationAccessory } from "../../models/my-reservation-accessory";

export class MyReservationMapper {
  static toView(event: CurrentEvent, attendance: Attendance): MyReservation {
    return new MyReservation(
      attendance.id,
      attendance.groupId,
      attendance.groupId === null ? null : event.findGroup(attendance.groupId)?.name ?? null,
      attendance.supportIds,
      event.supports
        .filter((support) => attendance.supportIds.includes(support.id))
        .map((support) => new MyReservationAccessory(support.id, support.name)),
      attendance.user.name,
      attendance.user.pronoun,
      attendance.sync,
      attendance.sync === AttendanceSync.Rejected ? attendance.syncError : null,
    );
  }
}
