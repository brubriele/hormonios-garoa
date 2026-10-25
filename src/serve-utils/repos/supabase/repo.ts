import {
  AccessorySoldOutError,
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
import type { EventSnapshot } from "../../models/event-snapshot";
import { User } from "../../models/user";
import type {
  IApplyValidationData,
  IApplyValidationResult,
  ICancelByDeviceFilter,
  IClaimPendingFilter,
  IHormoniosRepo,
  IListByDeviceFilter,
  IMarkSyncData,
  IMoveAttendancesData,
  IRawAttendance,
  IRawAttendanceData,
  IRawAttendanceWithUser,
  IRawCurrentEvent,
  IRawCurrentEventData,
  IRawUser,
  IReserveData,
  ISaveVacanciesData,
  IUpsertUserData,
  IWebhookDeliveryData,
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
  ACCESSORY_SOLD_OUT: () => new AccessorySoldOutError("Accessory is sold out"),
  INVALID_SUPPORT: () => new InvalidParameterError("Field supportIds is invalid"),
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
      (data.groups ?? []).map(
        (group) =>
          new Group(
            group.id,
            group.name,
            group.stockTotal ?? null,
            group.active,
            raw.external_id ? group.taken ?? 0 : null,
            group.instrumentSupportId ?? null,
            group.rotativo ?? false,
          ),
      ),
      // retrato da fase 1 sem os campos novos: sem limite, não rotativo, vale para todos os grupos
      (data.supports ?? []).map(
        (support) =>
          new Support(
            support.id,
            support.name,
            support.stockTotal ?? null,
            raw.external_id ? support.taken ?? 0 : null,
            support.rotativo ?? false,
            support.groupIds ?? [],
          ),
      ),
      raw.external_id ?? null,
      raw.fetched_at ?? null,
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
        ...(group.taken === null ? {} : { taken: group.taken }),
        ...(group.instrumentSupportId === null ? {} : { instrumentSupportId: group.instrumentSupportId }),
        rotativo: group.rotativo,
      })),
      supports: event.supports.map((support) => ({
        id: support.id,
        name: support.name,
        stockTotal: support.stockTotal,
        ...(support.taken === null ? {} : { taken: support.taken }),
        rotativo: support.rotativo,
        groupIds: support.groupIds,
      })),
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
      raw.transicionais_sync ?? "PENDING",
      raw.transicionais_sync === "REJECTED" ? raw.sync_error ?? null : null,
      raw.updated_at ?? null,
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

  // trava do retrato na função gravar_retrato; o whatsappUrl gravado fica
  async saveSnapshot(snapshot: EventSnapshot): Promise<boolean> {
    const { whatsappUrl: _local, ...data } = this.mapperCurrentEventData(snapshot.event);

    const response = await this.supabaseClient.query<boolean>((sdk) =>
      sdk.rpc("gravar_retrato", {
        p_external_id: snapshot.externalId,
        p_version: snapshot.version,
        p_vacancies_at: snapshot.vacanciesAt,
        p_data: data,
      }),
    );

    if (response.error) {
      throw new Error(`Supabase gravar_retrato failed with ${response.status}: ${response.error.message}`);
    }

    return response.data === true;
  }

  async saveWhatsappUrl(url: string): Promise<void> {
    const response = await this.supabaseClient.query<null>((sdk) => sdk.rpc("gravar_whatsapp", { p_url: url }));

    if (response.error?.message === "EVENT_NOT_FOUND") {
      throw new NotFoundError("Current event Not Found");
    }

    if (response.error) {
      throw new Error(`Supabase gravar_whatsapp failed with ${response.status}: ${response.error.message}`);
    }
  }

  async moveAttendances(data: IMoveAttendancesData): Promise<number> {
    const response = await this.supabaseClient.query<number>((sdk) =>
      sdk.rpc("migrar_fase1", {
        p_old_day_key: data.oldDayKey,
        p_new_day_key: data.newDayKey,
        p_group_map: data.groupMap,
      }),
    );

    if (response.error) {
      throw new Error(`Supabase migrar_fase1 failed with ${response.status}: ${response.error.message}`);
    }

    return response.data ?? 0;
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

  // "Não vou": libera a vaga do instrumento; só a linha deste aparelho. Volta a PENDING, para o envio
  async cancelByDevice(filter: ICancelByDeviceFilter): Promise<Attendance> {
    const cancelled: IRawAttendanceData = { answer: "nao-vou", groupId: null, supportIds: [] };

    const response = await this.supabaseClient.query<IRawAttendanceWithUser[]>((sdk) =>
      sdk
        .from("hg_attendances")
        .update({
          data: cancelled,
          transicionais_sync: "PENDING",
          sync_error: null,
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", filter.attendanceId)
        .eq("day_key", filter.dayKey)
        .eq("device_id", filter.deviceId)
        .select(ATTENDANCE_WITH_USER),
    );

    if (response.error) {
      throw new Error(`Supabase cancelByDevice failed with ${response.status}: ${response.error.message}`);
    }

    const row = response.data?.[0];

    if (!row) {
      throw new NotFoundError("Reservation Not Found");
    }

    return this.mapperAttendanceWithUser(row);
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

  // claim_pending trava e adia as linhas; o PostgREST embute o hg_users na resposta da função
  async claimPending(filter: IClaimPendingFilter): Promise<Attendance[]> {
    // função que devolve setof: o SDK tipa como linha ou lista
    const response = await this.supabaseClient.query<IRawAttendanceWithUser | (IRawAttendanceWithUser | null)[] | null>(
      (sdk) =>
        sdk.rpc("claim_pending", { p_day_key: filter.dayKey, p_limit: filter.limit }).select(ATTENDANCE_WITH_USER),
    );

    if (response.error) {
      throw new Error(`Supabase claim_pending failed with ${response.status}: ${response.error.message}`);
    }

    const rows = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];

    return rows
      .filter((raw): raw is IRawAttendanceWithUser => raw !== null)
      .map((raw) => this.mapperAttendanceWithUser(raw));
  }

  // trava do updated_at na função marcar_sync
  async markSync(data: IMarkSyncData): Promise<boolean> {
    const response = await this.supabaseClient.query<boolean>((sdk) =>
      sdk.rpc("marcar_sync", {
        p_id: data.attendanceId,
        p_updated_at: data.updatedAt,
        p_mode: data.mode,
        p_order_id: data.mode === "SYNCED" ? data.orderId : null,
        p_changed_at: data.mode === "SYNCED" ? data.changedAt : null,
        p_guest_id: data.mode === "SYNCED" ? data.guestId : null,
        p_error: data.mode === "REJECTED" ? data.error : null,
      }),
    );

    if (response.error) {
      throw new Error(`Supabase marcar_sync failed with ${response.status}: ${response.error.message}`);
    }

    return response.data === true;
  }

  // travas de changedAt e da mudança local mais nova na função aplicar_validacao
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async applyValidation(data: IApplyValidationData): Promise<IApplyValidationResult> {
    const attendanceData: IRawAttendanceData = {
      answer: data.answer,
      groupId: data.groupId,
      supportIds: data.supportIds,
    };

    const response = await this.supabaseClient.query<IApplyValidationResult>((sdk) =>
      sdk.rpc("aplicar_validacao", {
        p_order_id: data.orderId,
        p_day_key: data.dayKey,
        p_guest_id: data.guestId,
        p_email: data.email,
        p_data: attendanceData,
        p_changed_at: data.changedAt,
      }),
    );

    if (response.error || !response.data) {
      throw new Error(`Supabase aplicar_validacao failed with ${response.status}: ${response.error?.message}`);
    }

    return response.data;
  }

  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async saveVacancies(data: ISaveVacanciesData): Promise<boolean> {
    const response = await this.supabaseClient.query<boolean>((sdk) =>
      sdk.rpc("gravar_vagas", {
        p_day_key: data.dayKey,
        p_vacancies_at: data.vacanciesAt,
        p_taken: { groups: data.groups, supports: data.supports },
      }),
    );

    if (response.error) {
      throw new Error(`Supabase gravar_vagas failed with ${response.status}: ${response.error.message}`);
    }

    return response.data === true;
  }

  // insert ... on conflict do nothing: sem linha de volta = entrega repetida
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async registerWebhookDelivery(data: IWebhookDeliveryData): Promise<boolean> {
    const response = await this.supabaseClient.query<{ delivery_id: string }[]>((sdk) =>
      sdk
        .from("hg_webhook_deliveries")
        .upsert(
          { delivery_id: data.deliveryId, type: data.type },
          { onConflict: "delivery_id", ignoreDuplicates: true },
        )
        .select("delivery_id"),
    );

    if (response.error) {
      throw new Error(`Supabase registerWebhookDelivery failed with ${response.status}: ${response.error.message}`);
    }

    return (response.data ?? []).length > 0;
  }

  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async releaseWebhookDelivery(deliveryId: string): Promise<void> {
    const response = await this.supabaseClient.query<null>((sdk) =>
      sdk.from("hg_webhook_deliveries").delete().eq("delivery_id", deliveryId),
    );

    if (response.error) {
      throw new Error(`Supabase releaseWebhookDelivery failed with ${response.status}: ${response.error.message}`);
    }
  }
}
