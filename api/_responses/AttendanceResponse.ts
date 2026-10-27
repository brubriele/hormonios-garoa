import type { Attendance } from "../../src/serve-utils/domain/Attendance";

export class AttendanceResponse {
  static fromDomain(attendance: Attendance) {
    const eventId = typeof attendance.event === "string" ? attendance.event : attendance.event.id;
    const groupId = attendance.eventGroup ? attendance.eventGroup.id : null;

    return {
      id: attendance.id,
      eventId,
      groupId,
      supportIds: attendance.catalog.map((item) => item.id),
      answer: attendance.answer,
      sync: attendance.sync,
      createdAt: attendance.createdAt,
    };
  }
}
