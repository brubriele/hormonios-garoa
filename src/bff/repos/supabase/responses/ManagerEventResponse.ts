import { z } from "zod";
import type { Event } from "../../../domain/Event";
import { ManagerEvent } from "../../../domain/ManagerEvent";
import { AttendanceMapper } from "../../../domain/mappers/AttendanceMapper";
import { EventMapper } from "../../../domain/mappers/EventMapper";
import { UserMapper } from "../../../domain/mappers/UserMapper";
import type { User } from "../../../domain/User";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { AttendanceDataSchema } from "./AttendanceResponse";
import { EventDataSchema } from "./EventResponse";
import { UserDataSchema } from "./UserResponse";

const OPERATION = "findCurrentEvent";

const AttendanceUserSchema = z.object({
  data: UserDataSchema,
});

const EventAttendanceSchema = z.object({
  data: AttendanceDataSchema,
  user: AttendanceUserSchema,
});

// spec-8 D8
const CurrentEventEventSchema = z.object({
  data: EventDataSchema,
  attendance: z.array(EventAttendanceSchema),
});

// spec-8 D1
const CurrentEventRowSchema = z.object({
  isActive: z.boolean(),
  event: CurrentEventEventSchema,
});

type IEventAttendanceRow = z.infer<typeof EventAttendanceSchema>;

export class ManagerEventResponse {
  static toDomain(raw: unknown): ManagerEvent {
    const row = parseResponse(CurrentEventRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () => {
      const event = EventMapper.fromData({ ...row.event.data, isActive: row.isActive });
      const users = ManagerEventResponse.toUsers(row.event.attendance, event);

      return new ManagerEvent(event, users);
    });
  }

  private static toUsers(rows: IEventAttendanceRow[], event: Event): User[] {
    const userIds = rows.map((row) => row.user.data.id);
    const uniqueUserIds = new Set(userIds);

    return [...uniqueUserIds].map((userId) => {
      const userRows = rows.filter((row) => row.user.data.id === userId);
      const attendances = userRows.map((row) => AttendanceMapper.fromData(row.data, event));

      return UserMapper.fromData(userRows[0].user.data, attendances);
    });
  }
}
