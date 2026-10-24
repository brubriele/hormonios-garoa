import {
  AlreadyReservedError,
  AppError,
  BookingClosedError,
  EventChangedError,
  InvalidParameterError,
  NotFoundError,
  SoldOutError,
} from "../../errors/app-error";
import { SupabaseClient } from "../../clients/supabase-client";
import { Attendance } from "../../models/attendance";
import { CurrentEvent, Group, Support } from "../../models/current-event";
import { User } from "../../models/user";
import type {
  ICancelByDeviceFilter,
  IHormoniosRepo,
  IListByDeviceFilter,
  IRawAttendance,
  IRawAttendanceData,
  IRawAttendanceWithUser,
  IRawCurrentEvent,
  IRawCurrentEventData,
  IRawUser,
  IReserveData,
  IUpsertUserData,
} from "../../interfaces/hormonios";

const CURRENT_EVENT_ID = 1;
const ATTENDANCE_WITH_USER = "*, hg_users(*)";

// codigos de raise exception da funcao reservar
const SQL_ERRORS: Record<string, () => AppError> = {
  BOOKING_CLOSED: () => new BookingClosedError("Booking is closed"),
  EVENT_CHANGED: () => new EventChangedError("Event has changed"),
  INVALID_GROUP: () => new InvalidParameterError("Field groupId is invalid"),
  ALREADY_RESERVED: () => new AlreadyReservedError("Email already has a reservation for this event"),
  SOLD_OUT: () => new SoldOutError("Group is sold out"),
};

export class HormoniosRepo implements IHormoniosRepo {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  private mapperCurrentEvent(raw: IRawCurrentEvent): CurrentEvent {
    const data = raw.data;

    return new CurrentEvent(
      data.dayKey,
      data.date,
      data.time,
      data.location,
      data.bookingOpen,
      data.whatsappUrl,
      (data.groups ?? []).map((group) => new Group(group.id, group.name, group.stockTotal, group.active)),
      (data.supports ?? []).map((support) => new Support(support.id, support.name)),
    );
  }

  private mapperCurrentEventData(event: CurrentEvent): IRawCurrentEventData {
    return {
      dayKey: event.dayKey,
      date: event.date,
      time: event.time,
      location: event.location,
      bookingOpen: event.bookingOpen,
      whatsappUrl: event.whatsappUrl,
      groups: event.groups.map((group) => ({
        id: group.id,
        name: group.name,
        stockTotal: group.stockTotal,
        active: group.active,
      })),
      supports: event.supports.map((support) => ({ id: support.id, name: support.name })),
    };
  }

  private mapperUser(raw: IRawUser): User {
    return new User(raw.id, raw.email, raw.name, raw.pronoun);
  }

  private mapperAttendance(raw: IRawAttendance, user: User): Attendance {
    return new Attendance(
      raw.id,
      user,
      raw.day_key,
      raw.device_id,
      raw.data.answer,
      raw.data.groupId ?? null,
      raw.data.supportIds ?? [],
      raw.created_at,
    );
  }

  private mapperAttendanceWithUser(raw: IRawAttendanceWithUser): Attendance {
    return this.mapperAttendance(raw, this.mapperUser(raw.hg_users));
  }

  async findCurrentEvent(): Promise<CurrentEvent | null> {
    const response = await this.supabaseClient.query<IRawCurrentEvent>((sdk) =>
      sdk.from("hg_current_event").select("*").eq("id", CURRENT_EVENT_ID).maybeSingle(),
    );

    if (response.error) {
      throw new Error(`Supabase findCurrentEvent failed with ${response.status}: ${response.error.message}`);
    }

    if (!response.data) {
      return null;
    }

    return this.mapperCurrentEvent(response.data);
  }

  async findCurrentEventOrFail(): Promise<CurrentEvent> {
    const event = await this.findCurrentEvent();

    if (!event) {
      throw new NotFoundError("Current event Not Found");
    }

    return event;
  }

  async saveCurrentEvent(event: CurrentEvent): Promise<CurrentEvent> {
    const response = await this.supabaseClient.query<IRawCurrentEvent>((sdk) =>
      sdk
        .from("hg_current_event")
        .update({ data: this.mapperCurrentEventData(event), updated_at: new Date().toISOString() })
        .eq("id", CURRENT_EVENT_ID)
        .select("*")
        .single(),
    );

    if (response.error || !response.data) {
      throw new Error(`Supabase saveCurrentEvent failed with ${response.status}: ${response.error?.message}`);
    }

    return this.mapperCurrentEvent(response.data);
  }

  // o mesmo e-mail com outro nome troca o nome e o pronome
  async upsertUserByEmail(data: IUpsertUserData): Promise<User> {
    const response = await this.supabaseClient.query<IRawUser>((sdk) =>
      sdk
        .from("hg_users")
        .upsert(
          { email: data.email, name: data.name, pronoun: data.pronoun, updated_at: new Date().toISOString() },
          { onConflict: "email" },
        )
        .select("*")
        .single(),
    );

    if (response.error || !response.data) {
      throw new Error(`Supabase upsertUserByEmail failed with ${response.status}: ${response.error?.message}`);
    }

    return this.mapperUser(response.data);
  }

  async reserve(data: IReserveData): Promise<Attendance> {
    const attendanceData: IRawAttendanceData = {
      answer: "vou",
      groupId: data.groupId,
      supportIds: data.supportIds,
    };

    const response = await this.supabaseClient.query<IRawAttendance>((sdk) =>
      sdk
        .rpc("reservar", {
          p_user_id: data.user.id,
          p_day_key: data.dayKey,
          p_device_id: data.deviceId,
          p_data: attendanceData,
        })
        .single(),
    );

    const knownError = response.error && SQL_ERRORS[response.error.message];

    if (knownError) {
      throw knownError();
    }

    if (response.error || !response.data) {
      throw new Error(`Supabase reservar failed with ${response.status}: ${response.error?.message}`);
    }

    return this.mapperAttendance(response.data, data.user);
  }

  // "Não vou": libera a vaga do instrumento; só a linha deste aparelho
  async cancelByDevice(filter: ICancelByDeviceFilter): Promise<void> {
    const cancelled: IRawAttendanceData = { answer: "nao-vou", groupId: null, supportIds: [] };

    const response = await this.supabaseClient.query<Pick<IRawAttendance, "id">[]>((sdk) =>
      sdk
        .from("hg_attendances")
        .update({ data: cancelled, updated_at: new Date().toISOString() })
        .eq("id", filter.attendanceId)
        .eq("day_key", filter.dayKey)
        .eq("device_id", filter.deviceId)
        .select("id"),
    );

    if (response.error) {
      throw new Error(`Supabase cancelByDevice failed with ${response.status}: ${response.error.message}`);
    }

    if (!response.data || response.data.length === 0) {
      throw new NotFoundError("Reservation Not Found");
    }
  }

  async listByDevice(filter: IListByDeviceFilter): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<IRawAttendanceWithUser[]>((sdk) =>
      sdk
        .from("hg_attendances")
        .select(ATTENDANCE_WITH_USER)
        .eq("day_key", filter.dayKey)
        .eq("device_id", filter.deviceId)
        .order("created_at", { ascending: true }),
    );

    if (response.error) {
      throw new Error(`Supabase listByDevice failed with ${response.status}: ${response.error.message}`);
    }

    return (response.data ?? []).map((raw) => this.mapperAttendanceWithUser(raw));
  }

  async listByDay(dayKey: string): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<IRawAttendanceWithUser[]>((sdk) =>
      sdk
        .from("hg_attendances")
        .select(ATTENDANCE_WITH_USER)
        .eq("day_key", dayKey)
        .order("created_at", { ascending: true }),
    );

    if (response.error) {
      throw new Error(`Supabase listByDay failed with ${response.status}: ${response.error.message}`);
    }

    return (response.data ?? []).map((raw) => this.mapperAttendanceWithUser(raw));
  }
}
