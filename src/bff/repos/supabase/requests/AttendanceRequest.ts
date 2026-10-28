import type { Attendance } from "../../../domain/Attendance";

// linha de attendance: a Attendance inteira vai em data; as colunas repetem o que o repo consulta
export interface RowAttendance {
  id: string;
  eventId: string;
  userId: string;
  syncHash: string | null;
  syncedAt: string | null;
  data: ReturnType<Attendance["toJson"]>;
  updated_at: string;
}

export class AttendanceRequest {
  static fromDomain(attendance: Attendance, now: string): RowAttendance {
    const data = attendance.toJson();

    return {
      id: attendance.id,
      eventId: data.eventId,
      userId: attendance.metadata.userId,
      syncHash: attendance.metadata.syncHash,
      syncedAt: attendance.metadata.syncedAt,
      data,
      updated_at: now,
    };
  }
}
