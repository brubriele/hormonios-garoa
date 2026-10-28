import { SupabaseClient } from "../../clients/supabase-client";
import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import type { IntegrationSetting } from "../../domain/IntegrationSetting";
import type { IntegrationEntity, IntegrationStatus } from "../../domain/IntegrationStatus";
import type { SyncStatus } from "../../domain/SyncStatus";
import type { User } from "../../domain/User";
import { DatabaseError } from "../../errors/infra-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";
import { AttendanceRequest } from "./requests/AttendanceRequest";
import { EventRequest } from "./requests/EventRequest";
import { IntegrationSettingRequest } from "./requests/IntegrationSettingRequest";
import { IntegrationStatusRequest } from "./requests/IntegrationStatusRequest";
import { UserRequest } from "./requests/UserRequest";
import { AttendanceResponse } from "./responses/AttendanceResponse";
import { EventResponse } from "./responses/EventResponse";
import { IntegrationSettingResponse } from "./responses/IntegrationSettingResponse";
import { IntegrationStatusResponse } from "./responses/IntegrationStatusResponse";
import { UserResponse } from "./responses/UserResponse";

const logger = createLogger("HormoniosRepository", LogContext.HormoniosRepository);

const TABLE = "event";
const USER_TABLE = "user";
const ATTENDANCE_TABLE = "attendance";
const INTEGRATION_STATUS_TABLE = "integration_status";
const INTEGRATION_STATUS_COLUMNS = 'id, entity, "entityId", status, "syncAt", tentatives, "nextSyncAt", "errorCtx"';
const SETTING_TABLE = "setting";
const INTEGRATION_SETTING_ID = "integration";

export class HormoniosRepository implements IHormoniosRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async findEvent(id: string): Promise<Event | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(TABLE).select("data").eq("id", id).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError(
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
      throw this.databaseError("findEventByIntegrationId", response.status, response.error.message);
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  async findEventByTransicionaisDayId(transicionaisDayId: number): Promise<Event | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(TABLE).select("data").eq("transicionaisDayId", transicionaisDayId).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findEventByTransicionaisDayId", response.status, response.error.message);
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  async findEventByAttendanceId(attendanceId: string): Promise<Event | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(TABLE).select(`data, ${ATTENDANCE_TABLE}!inner(id)`).eq(`${ATTENDANCE_TABLE}.id`, attendanceId).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findEventByAttendanceId", response.status, response.error.message);
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  // D2
  async findCurrentEvent(): Promise<Event | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(TABLE).select("data").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findCurrentEvent", response.status, response.error.message);
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  async createEvent(event: Event): Promise<Event> {
    const now = new Date();
    const row = EventRequest.fromDomain(event, now.toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from(TABLE)
        .insert(row)
        .select("data")
        .single(),
    );

    if (response.error || !response.data) {
      throw this.databaseError(
        "createEvent",
        response.status,
        response.error?.message,
      );
    }

    return EventResponse.toDomain(response.data);
  }

  async updateEvent(event: Event): Promise<Event> {
    const now = new Date();
    const row = EventRequest.fromDomain(event, now.toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from(TABLE)
        .update(row)
        .eq("id", event.id)
        .select("data")
        .single(),
    );

    if (response.error || !response.data) {
      throw this.databaseError(
        "updateEvent",
        response.status,
        response.error?.message,
      );
    }

    return EventResponse.toDomain(response.data);
  }

  async findUser(id: string): Promise<User | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).select("data").eq("id", id).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findUser", response.status, response.error.message);
    }

    return response.data ? UserResponse.toDomain(response.data, []) : null;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).select("data").eq("email", email).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findUserByEmail", response.status, response.error.message);
    }

    return response.data ? UserResponse.toDomain(response.data, []) : null;
  }

  // D7
  async findUserByIntegrationId(integrationId: string): Promise<User | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).select("data").eq("data->metadata->>integrationId", integrationId).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findUserByIntegrationId", response.status, response.error.message);
    }

    return response.data ? UserResponse.toDomain(response.data, []) : null;
  }

  // D3, D16
  async findUserById(id: string, event: Event): Promise<User | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).select("data").eq("id", id).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findUserById", response.status, response.error.message);
    }

    if (!response.data) {
      return null;
    }

    const attendances = await this.findUserAttendances(id, event);

    return UserResponse.toDomain(response.data, attendances);
  }

  // D8
  async createOrUpdateUser(user: User): Promise<User> {
    const now = new Date();
    const row = UserRequest.fromDomain(user, now.toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(USER_TABLE).upsert(row, { onConflict: "id" }).select("data").single(),
    );

    if (response.error || !response.data) {
      throw this.databaseError("createOrUpdateUser", response.status, response.error?.message);
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
      throw this.databaseError("findEventUsers", response.status, response.error?.message);
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
      throw this.databaseError("findAttendance", response.status, response.error.message);
    }

    return response.data ? AttendanceResponse.toDomain(response.data, event) : null;
  }

  async findEventAttendance(event: Event): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<unknown[]>((sdk) =>
      sdk.from(ATTENDANCE_TABLE).select("data").eq("eventId", event.id).order("created_at"),
    );

    if (response.error || !response.data) {
      throw this.databaseError("findEventAttendance", response.status, response.error?.message);
    }

    return response.data.map((row) => AttendanceResponse.toDomain(row, event));
  }

  // D7
  async findAttendanceByIntegrationId(integrationId: number, event: Event): Promise<Attendance | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from(ATTENDANCE_TABLE)
        .select("data")
        .eq("eventId", event.id)
        .eq("data->metadata->>integrationId", String(integrationId))
        .maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findAttendanceByIntegrationId", response.status, response.error.message);
    }

    return response.data ? AttendanceResponse.toDomain(response.data, event) : null;
  }

  // D8
  async createOrUpdateAttendance(attendance: Attendance, event: Event): Promise<Attendance> {
    const now = new Date();
    const row = AttendanceRequest.fromDomain(attendance, now.toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(ATTENDANCE_TABLE).upsert(row, { onConflict: "id" }).select("data").single(),
    );

    if (response.error || !response.data) {
      throw this.databaseError("createOrUpdateAttendance", response.status, response.error?.message);
    }

    return AttendanceResponse.toDomain(response.data, event);
  }

  async findIntegrationStatus(entity: IntegrationEntity, entityId: string): Promise<IntegrationStatus | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(INTEGRATION_STATUS_TABLE).select(INTEGRATION_STATUS_COLUMNS).eq("entity", entity).eq("entityId", entityId).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findIntegrationStatus", response.status, response.error.message);
    }

    return response.data ? IntegrationStatusResponse.toDomain(response.data) : null;
  }

  async findDueIntegrationStatus(entity: IntegrationEntity, status: SyncStatus, now: Date, limit: number): Promise<IntegrationStatus[]> {
    const until = now.toISOString();
    const response = await this.supabaseClient.query<unknown[]>((sdk) =>
      sdk
        .from(INTEGRATION_STATUS_TABLE)
        .select(INTEGRATION_STATUS_COLUMNS)
        .eq("entity", entity)
        .eq("status", status)
        .or(`nextSyncAt.is.null,nextSyncAt.lte.${until}`)
        .order("syncAt")
        .limit(limit),
    );

    if (response.error || !response.data) {
      throw this.databaseError("findDueIntegrationStatus", response.status, response.error?.message);
    }

    return response.data.map((row) => IntegrationStatusResponse.toDomain(row));
  }

  async createOrUpdateIntegrationStatus(integrationStatus: IntegrationStatus): Promise<IntegrationStatus> {
    const now = new Date();
    const row = IntegrationStatusRequest.fromDomain(integrationStatus, now.toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from(INTEGRATION_STATUS_TABLE)
        .upsert(row, { onConflict: "entity,entityId" })
        .select(INTEGRATION_STATUS_COLUMNS)
        .single(),
    );

    if (response.error || !response.data) {
      throw this.databaseError("createOrUpdateIntegrationStatus", response.status, response.error?.message);
    }

    return IntegrationStatusResponse.toDomain(response.data);
  }

  // K1
  async isTransicionaisEnabled(): Promise<boolean> {
    const setting = await this.findIntegrationSetting();

    return setting.transicionaisEnabled;
  }

  // K1
  async findIntegrationSetting(): Promise<IntegrationSetting> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(SETTING_TABLE).select("data").eq("id", INTEGRATION_SETTING_ID).maybeSingle(),
    );

    if (response.error) {
      throw this.databaseError("findIntegrationSetting", response.status, response.error.message);
    }

    if (!response.data) {
      const now = new Date();

      return IntegrationSettingResponse.toDefault(now.toISOString());
    }

    return IntegrationSettingResponse.toDomain(response.data);
  }

  async updateIntegrationSetting(setting: IntegrationSetting): Promise<IntegrationSetting> {
    const now = new Date();
    const row = IntegrationSettingRequest.fromDomain(setting, INTEGRATION_SETTING_ID, now.toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from(SETTING_TABLE).upsert(row, { onConflict: "id" }).select("data").single(),
    );

    if (response.error || !response.data) {
      throw this.databaseError("updateIntegrationSetting", response.status, response.error?.message);
    }

    return IntegrationSettingResponse.toDomain(response.data);
  }

  // D16
  private async findUserAttendances(userId: string, event: Event): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<unknown[]>((sdk) =>
      sdk.from(ATTENDANCE_TABLE).select("data").eq("userId", userId).eq("eventId", event.id).order("created_at"),
    );

    if (response.error || !response.data) {
      throw this.databaseError("findUserAttendances", response.status, response.error?.message);
    }

    return response.data.map((row) => AttendanceResponse.toDomain(row, event));
  }

  private databaseError(operation: string, status: number, message?: string): DatabaseError {
    const error = new DatabaseError(operation, status, message);

    logger.repositoryError(error, operation);

    return error;
  }
}
