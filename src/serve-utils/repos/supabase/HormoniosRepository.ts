import { SupabaseClient } from "../../clients/supabase-client";
import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import type { User } from "../../domain/User";
import { DatabaseError } from "../../errors/infra-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { AttendanceRequest } from "./requests/AttendanceRequest";
import { EventRequest } from "./requests/EventRequest";
import { UserRequest } from "./requests/UserRequest";
import { AttendanceResponse } from "./responses/AttendanceResponse";
import { EventResponse } from "./responses/EventResponse";
import { UserResponse } from "./responses/UserResponse";

const TABLE = "event";
const USER_TABLE = "user";
const ATTENDANCE_TABLE = "attendance";

export class HormoniosRepository implements IHormoniosRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findEvent(id: string): Promise<Event | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(TABLE).select("data").eq("id", id).maybeSingle(),
    );

    if (response.error) {
      throw new DatabaseError(
        "findEvent",
        response.status,
        response.error.message,
      );
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  // D7
  async findEventByIntegrationId(integrationId: number): Promise<Event | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(TABLE).select("data").eq("integrationId", integrationId).maybeSingle(),
    );

    if (response.error) {
      throw new DatabaseError("findEventByIntegrationId", response.status, response.error.message);
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  // D2
  async findCurrentEvent(): Promise<Event | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(TABLE).select("data").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    );

    if (response.error) {
      throw new DatabaseError("findCurrentEvent", response.status, response.error.message);
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  async createEvent(event: Event): Promise<Event> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from(TABLE)
        .insert(EventRequest.fromDomain(event, new Date().toISOString()))
        .select("data")
        .single(),
    );

    if (response.error || !response.data) {
      throw new DatabaseError(
        "createEvent",
        response.status,
        response.error?.message,
      );
    }

    return EventResponse.toDomain(response.data);
  }

  async updateEvent(event: Event): Promise<Event> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from(TABLE)
        .update(EventRequest.fromDomain(event, new Date().toISOString()))
        .eq("id", event.id)
        .select("data")
        .single(),
    );

    if (response.error || !response.data) {
      throw new DatabaseError(
        "updateEvent",
        response.status,
        response.error?.message,
      );
    }

    return EventResponse.toDomain(response.data);
  }

  // D16
  async findUser(email: string, event: Event): Promise<User | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).select("id, data").eq("email", email).maybeSingle(),
    );

    if (response.error) {
      throw new DatabaseError("findUser", response.status, response.error.message);
    }

    if (!response.data) {
      return null;
    }

    const userId = (response.data as { id: string }).id;
    const attendances = await this.findUserAttendances(userId, event);

    return UserResponse.toDomain(response.data, attendances);
  }

  // D3, D16
  async findUserById(id: string, event: Event): Promise<User | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).select("data").eq("id", id).maybeSingle(),
    );

    if (response.error) {
      throw new DatabaseError("findUserById", response.status, response.error.message);
    }

    if (!response.data) {
      return null;
    }

    const attendances = await this.findUserAttendances(id, event);

    return UserResponse.toDomain(response.data, attendances);
  }

  // D8
  async createOrUpdateUser(user: User): Promise<User> {
    const row = UserRequest.fromDomain(user, new Date().toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).upsert(row, { onConflict: "id" }).select("data").single(),
    );

    if (response.error || !response.data) {
      throw new DatabaseError("createOrUpdateUser", response.status, response.error?.message);
    }

    return UserResponse.toDomain(response.data, user.attendances);
  }

  // D5
  async findEventUsers(event: Event): Promise<User[]> {
    const attendances = await this.findEventAttendance(event);
    const userIds = attendances.map((attendance) => attendance.metadata.userId);
    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) {
      return [];
    }

    const response = await this.supabaseClient.query<unknown[]>((sdk) =>
      sdk.from(USER_TABLE).select("id, data").in("id", uniqueUserIds),
    );

    if (response.error || !response.data) {
      throw new DatabaseError("findEventUsers", response.status, response.error?.message);
    }

    return response.data.map((row) => {
      const userId = (row as { id: string }).id;
      const userAttendances = attendances.filter((attendance) => attendance.metadata.userId === userId);

      return UserResponse.toDomain(row, userAttendances);
    });
  }

  async findAttendance(id: string, event: Event): Promise<Attendance | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(ATTENDANCE_TABLE).select("data").eq("id", id).eq("eventId", event.id).maybeSingle(),
    );

    if (response.error) {
      throw new DatabaseError("findAttendance", response.status, response.error.message);
    }

    return response.data ? AttendanceResponse.toDomain(response.data, event) : null;
  }

  async findEventAttendance(event: Event): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<unknown[]>((sdk) =>
      sdk.from(ATTENDANCE_TABLE).select("data").eq("eventId", event.id).order("created_at"),
    );

    if (response.error || !response.data) {
      throw new DatabaseError("findEventAttendance", response.status, response.error?.message);
    }

    return response.data.map((row) => AttendanceResponse.toDomain(row, event));
  }

  // D8
  async createOrUpdateAttendance(attendance: Attendance, event: Event): Promise<Attendance> {
    const row = AttendanceRequest.fromDomain(attendance, new Date().toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(ATTENDANCE_TABLE).upsert(row, { onConflict: "id" }).select("data").single(),
    );

    if (response.error || !response.data) {
      throw new DatabaseError("createOrUpdateAttendance", response.status, response.error?.message);
    }

    return AttendanceResponse.toDomain(response.data, event);
  }

  // D16
  private async findUserAttendances(userId: string, event: Event): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<unknown[]>((sdk) =>
      sdk.from(ATTENDANCE_TABLE).select("data").eq("userId", userId).eq("eventId", event.id).order("created_at"),
    );

    if (response.error || !response.data) {
      throw new DatabaseError("findUserAttendances", response.status, response.error?.message);
    }

    return response.data.map((row) => AttendanceResponse.toDomain(row, event));
  }
}
