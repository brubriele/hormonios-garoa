import { SupabaseClient } from "../../clients/supabase-client";
import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import { EventPosition, type FindingInternalFilter } from "../../domain/FindingInternalFilter";
import type { IntegrationEntity, IntegrationStatus } from "../../domain/IntegrationStatus";
import type { ManagerEvent } from "../../domain/ManagerEvent";
import type { SyncStatus } from "../../domain/SyncStatus";
import type { User } from "../../domain/User";
import { type AppError, NotFoundError } from "../../errors/app-error";
import { DatabaseError } from "../../errors/infra-error";
import type {
  IFindAttendanceFilter,
  IFindEventFilter,
  IFindUserFilter,
  IHormoniosRepository,
} from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";
import { AttendanceRequest } from "./requests/AttendanceRequest";
import { CurrentEventRequest } from "./requests/CurrentEventRequest";
import { EventRequest } from "./requests/EventRequest";
import { IntegrationStatusRequest } from "./requests/IntegrationStatusRequest";
import { UpdateCurrentEventRequest } from "./requests/UpdateCurrentEventRequest";
import { UserRequest } from "./requests/UserRequest";
import { AttendanceResponse } from "./responses/AttendanceResponse";
import { CurrentEventResponse } from "./responses/CurrentEventResponse";
import { EventResponse } from "./responses/EventResponse";
import { IntegrationStatusResponse } from "./responses/IntegrationStatusResponse";
import { ManagerEventResponse } from "./responses/ManagerEventResponse";
import { UserResponse } from "./responses/UserResponse";

const logger = createLogger("HormoniosRepository", LogContext.HormoniosRepository);

const TABLE = "event";
const USER_TABLE = "user";
const ATTENDANCE_TABLE = "attendance";
const CURRENT_EVENT_TABLE = "current_event";
const EVENT_COLUMNS = `data, ${CURRENT_EVENT_TABLE}!eventId("isActive")`; // spec-8 C1
const MANAGER_EVENT_COLUMNS = `"isActive", ${TABLE}!eventId(data, ${ATTENDANCE_TABLE}(data, ${USER_TABLE}(data)))`; // spec-8 D1, D8
const MANAGER_EVENT_BY_INTEGRATION_COLUMNS = `"isActive", ${TABLE}!eventId!inner(data, ${ATTENDANCE_TABLE}(data, ${USER_TABLE}(data)))`; // spec-8 D3
const USER_WITH_ATTENDANCE_COLUMNS = `data, ${ATTENDANCE_TABLE}(data)`; // spec-8 D4
const INTEGRATION_STATUS_TABLE = "integration_status";
const INTEGRATION_STATUS_COLUMNS = 'id, entity, "entityId", status, "syncAt", tentatives, "nextSyncAt", "errorCtx"';

// R9, spec-8 B6
const SQL_ERRORS: Record<string, () => AppError> = {
  CURRENT_EVENT_NOT_FOUND: () => new NotFoundError("Current event not found"),
};

export class HormoniosRepository implements IHormoniosRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  // um get por entidade, com filtro nomeado
  async findEvent(filter: IFindEventFilter): Promise<Event | null> {
    const columns = filter.attendanceId === undefined ? EVENT_COLUMNS : `${EVENT_COLUMNS}, ${ATTENDANCE_TABLE}!inner(id)`;
    const response = await this.supabaseClient.query<unknown>((sdk) => {
      const query = sdk.from(TABLE).select(columns);

      if (filter.id !== undefined) {
        return query.eq("id", filter.id).maybeSingle();
      }

      if (filter.integrationId !== undefined) {
        return query.eq("integrationId", filter.integrationId).maybeSingle();
      }

      if (filter.transicionaisDayId !== undefined) {
        return query.eq("transicionaisDayId", filter.transicionaisDayId).maybeSingle();
      }

      return query.eq(`${ATTENDANCE_TABLE}.id`, filter.attendanceId ?? "").maybeSingle();
    });

    if (response.error) {
      throw this.databaseError("findEvent", response.status, response.error.message);
    }

    return response.data ? EventResponse.toDomain(response.data) : null;
  }

  // spec-8 D1, D2, A3
  async findCurrentEvent(filter: FindingInternalFilter): Promise<ManagerEvent | null> {
    const columns = filter.integrationId === null ? MANAGER_EVENT_COLUMNS : MANAGER_EVENT_BY_INTEGRATION_COLUMNS;
    const response = await this.supabaseClient.query<unknown>((sdk) => {
      const query = sdk
        .from(CURRENT_EVENT_TABLE)
        .select(columns)
        .order("created_at", { referencedTable: `${TABLE}.${ATTENDANCE_TABLE}` });

      if (filter.eventId !== null) {
        return query.eq("eventId", filter.eventId).maybeSingle();
      }

      if (filter.integrationId !== null) {
        return query.eq(`${TABLE}.integrationId`, filter.integrationId).maybeSingle();
      }

      if (filter.position === EventPosition.Current) {
        return query.eq("isCurrent", true).maybeSingle();
      }

      const next = query.eq("isCurrent", false).is("nextEventId", null);

      return next.maybeSingle();
    });

    if (response.error) {
      throw this.databaseError("findCurrentEvent", response.status, response.error.message);
    }

    return response.data ? ManagerEventResponse.toDomain(response.data) : null;
  }

  // spec-8 B4
  async createCurrentEvent(event: Event, isCurrent: boolean): Promise<void> {
    const row = CurrentEventRequest.fromDomain(event, isCurrent);
    const response = await this.supabaseClient.query<unknown>((sdk) => sdk.from(CURRENT_EVENT_TABLE).insert(row));

    if (response.error) {
      throw this.databaseError("createCurrentEvent", response.status, response.error.message);
    }
  }

  // spec-8 B1, B6
  async updateCurrentEvent(event: Event, isActive: boolean | null, isCurrent: boolean | null, next: Event | null): Promise<Event> {
    const params = UpdateCurrentEventRequest.fromDomain(event, isActive, isCurrent, next);
    const response = await this.supabaseClient.query<unknown>((sdk) => sdk.rpc("update_current_event", params).single());
    const knownError = response.error && SQL_ERRORS[response.error.message];

    if (knownError) {
      throw knownError();
    }

    if (response.error || !response.data) {
      throw this.databaseError("updateCurrentEvent", response.status, response.error?.message);
    }

    return CurrentEventResponse.toDomain(response.data, event);
  }

  async createEvent(event: Event): Promise<Event> {
    const now = new Date();
    const row = EventRequest.fromDomain(event, now.toISOString());
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from(TABLE)
        .insert(row)
        .select(EVENT_COLUMNS)
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
        .select(EVENT_COLUMNS)
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

  // D3, D7, D16, spec-8 D4: com o event, traz as presenças da pessoa nele, na mesma query
  async findUser(filter: IFindUserFilter): Promise<User | null> {
    const { event } = filter;
    const response = await this.supabaseClient.query<unknown>((sdk) => {
      const query = event
        ? sdk
            .from(USER_TABLE)
            .select(USER_WITH_ATTENDANCE_COLUMNS)
            .eq(`${ATTENDANCE_TABLE}.eventId`, event.id)
            .order("created_at", { referencedTable: ATTENDANCE_TABLE })
        : sdk.from(USER_TABLE).select("data");

      if (filter.id !== undefined) {
        return query.eq("id", filter.id).maybeSingle();
      }

      if (filter.email !== undefined) {
        return query.eq("email", filter.email).maybeSingle();
      }

      return query.eq("data->metadata->>integrationId", filter.integrationId ?? "").maybeSingle();
    });

    if (response.error) {
      throw this.databaseError("findUser", response.status, response.error.message);
    }

    if (!response.data) {
      return null;
    }

    return event ? UserResponse.toDomainForEvent(response.data, event) : UserResponse.toDomain(response.data, []);
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

  // D7
  async findAttendance(filter: IFindAttendanceFilter): Promise<Attendance | null> {
    const { event } = filter;
    const response = await this.supabaseClient.query<unknown>((sdk) => {
      const query = sdk.from(ATTENDANCE_TABLE).select("data").eq("eventId", event.id);

      if (filter.id !== undefined) {
        return query.eq("id", filter.id).maybeSingle();
      }

      return query.eq("data->metadata->>integrationId", String(filter.integrationId)).maybeSingle();
    });

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

  private databaseError(operation: string, status: number, message?: string): DatabaseError {
    const error = new DatabaseError(operation, status, message);

    logger.repositoryError(error, operation);

    return error;
  }
}
