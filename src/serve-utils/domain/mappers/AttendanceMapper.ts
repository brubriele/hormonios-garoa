import { InvalidParameterError } from "../../errors/app-error";
import { Attendance, type AttendanceAnswer, AttendanceMetadata } from "../Attendance";
import type { Event, EventCatalog, EventGroup } from "../Event";
import type { SyncStatus } from "../SyncStatus";

export interface IAttendanceMetadataData {
  userId: string;
  integrationId: number | null;
  deviceId: string;
  answer: AttendanceAnswer;
  sync: SyncStatus;
  syncError: string | null;
  syncHash: string | null;
  syncedAt: string | null;
}

export interface IAttendanceData {
  id: string;
  eventId: string;
  groupId: string | null;
  supportIds: string[];
  createdAt: string;
  metadata: IAttendanceMetadataData;
}

// F11
export class AttendanceMapper {
  static fromData(data: IAttendanceData, event: Event): Attendance {
    const { metadata } = data;
    const group = AttendanceMapper.toGroup(data.groupId, event);
    const catalog = data.supportIds.map((supportId) => AttendanceMapper.toCatalog(supportId, event));
    const attendanceMetadata = new AttendanceMetadata(
      metadata.deviceId,
      metadata.answer,
      metadata.sync,
      metadata.syncError,
      metadata.syncHash,
      metadata.syncedAt,
      metadata.userId,
      metadata.integrationId,
    );

    return new Attendance(event, data.id, group, catalog, data.createdAt, attendanceMetadata);
  }

  private static toGroup(groupId: string | null, event: Event): EventGroup | null {
    if (groupId === null) {
      return null;
    }

    const group = event.groups.find((item) => item.id === groupId);

    if (!group) {
      throw new InvalidParameterError(`Field groupId ${groupId} is not in event ${event.id}`);
    }

    return group;
  }

  private static toCatalog(supportId: string, event: Event): EventCatalog {
    const item = event.catalog.find((entry) => entry.id === supportId);

    if (!item) {
      throw new InvalidParameterError(`Field supportIds ${supportId} is not in event ${event.id}`);
    }

    return item;
  }
}
