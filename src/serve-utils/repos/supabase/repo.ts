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
import { ApplyValidationRequest } from "./requests/apply-validation.request";
import { CancelByDeviceRequest } from "./requests/cancel-by-device.request";
import { ClaimPendingRequest } from "./requests/claim-pending.request";
import { MarkSyncRequest } from "./requests/mark-sync.request";
import { MoveAttendancesRequest } from "./requests/move-attendances.request";
import { RegisterWebhookDeliveryRequest } from "./requests/register-webhook-delivery.request";
import { ReserveRequest } from "./requests/reserve.request";
import { SaveSnapshotRequest } from "./requests/save-snapshot.request";
import { SaveVacanciesRequest } from "./requests/save-vacancies.request";
import { SaveWhatsappRequest } from "./requests/save-whatsapp.request";
import { UpsertUserRequest } from "./requests/upsert-user.request";
import { ApplyValidationResponse } from "./responses/apply-validation.response";
import { AttendanceResponse } from "./responses/attendance.response";
import { CurrentEventResponse } from "./responses/current-event.response";
import { MovedCountResponse } from "./responses/moved-count.response";
import { SavedResponse } from "./responses/saved.response";
import { UserResponse } from "./responses/user.response";
import { WebhookDeliveryResponse } from "./responses/webhook-delivery.response";
import type { ApplyValidationResult, Attendance } from "../../models/attendance";
import { DatabaseError } from "../../errors/infra-error";
import type { CurrentEvent } from "../../models/current-event";
import type { EventSnapshot } from "../../models/event-snapshot";
import type { User } from "../../models/user";
import type {
  IApplyValidationData,
  ICancelByDeviceFilter,
  IClaimPendingFilter,
  IHormoniosRepo,
  IListByDeviceFilter,
  IMarkSyncData,
  IMoveAttendancesData,
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

  async findCurrentEvent(): Promise<CurrentEvent | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from("hg_current_event").select("*").eq("id", CURRENT_EVENT_ID).maybeSingle(),
    );

    if (response.error) {
      throw new DatabaseError("findCurrentEvent", response.status, response.error.message);
    }

    if (!response.data) {
      return null;
    }

    return CurrentEventResponse.toDomain(response.data);
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
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("gravar_retrato", SaveSnapshotRequest.fromDomain(snapshot)),
    );

    if (response.error) {
      throw new DatabaseError("gravar_retrato", response.status, response.error.message);
    }

    return SavedResponse.toDomain(response.data, "gravar_retrato");
  }

  async saveWhatsappUrl(url: string): Promise<void> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("gravar_whatsapp", SaveWhatsappRequest.fromDomain(url)),
    );

    if (response.error?.message === "EVENT_NOT_FOUND") {
      throw new NotFoundError("Current event Not Found");
    }

    if (response.error) {
      throw new DatabaseError("gravar_whatsapp", response.status, response.error.message);
    }
  }

  async moveAttendances(data: IMoveAttendancesData): Promise<number> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("migrar_fase1", MoveAttendancesRequest.fromDomain(data)),
    );

    if (response.error) {
      throw new DatabaseError("migrar_fase1", response.status, response.error.message);
    }

    return MovedCountResponse.toDomain(response.data, "migrar_fase1");
  }

  // o mesmo e-mail com outro nome troca o nome e o pronome
  async upsertUserByEmail(data: IUpsertUserData): Promise<User> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_users")
        .upsert(UpsertUserRequest.fromDomain(data, new Date().toISOString()), { onConflict: "email" })
        .select("*")
        .single(),
    );

    if (response.error || !response.data) {
      throw new DatabaseError("upsertUserByEmail", response.status, response.error?.message);
    }

    return UserResponse.toDomain(response.data, "upsertUserByEmail");
  }

  // a trava da última vaga fica na função reservar (R12)
  async reserve(data: IReserveData): Promise<Attendance> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("reservar", ReserveRequest.fromDomain(data)).single(),
    );

    const knownError = response.error && SQL_ERRORS[response.error.message];

    if (knownError) {
      throw knownError();
    }

    if (response.error || !response.data) {
      throw new DatabaseError("reservar", response.status, response.error?.message);
    }

    return AttendanceResponse.toDomainForUser(response.data, data.user, "reservar");
  }

  // "Não vou": libera a vaga do instrumento; só a linha deste aparelho. Volta a PENDING, para o envio
  async cancelByDevice(filter: ICancelByDeviceFilter): Promise<Attendance> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_attendances")
        .update(CancelByDeviceRequest.fromDomain(new Date().toISOString()))
        .eq("id", filter.attendanceId)
        .eq("day_key", filter.dayKey)
        .eq("device_id", filter.deviceId)
        .select(ATTENDANCE_WITH_USER),
    );

    if (response.error) {
      throw new DatabaseError("cancelByDevice", response.status, response.error.message);
    }

    const attendance = AttendanceResponse.toDomainList(response.data, "cancelByDevice")[0];

    if (!attendance) {
      throw new NotFoundError("Reservation Not Found");
    }

    return attendance;
  }

  async listByDevice(filter: IListByDeviceFilter): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_attendances")
        .select(ATTENDANCE_WITH_USER)
        .eq("day_key", filter.dayKey)
        .eq("device_id", filter.deviceId)
        .order("created_at", { ascending: true }),
    );

    if (response.error) {
      throw new DatabaseError("listByDevice", response.status, response.error.message);
    }

    return AttendanceResponse.toDomainList(response.data, "listByDevice");
  }

  async listByDay(dayKey: string): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_attendances")
        .select(ATTENDANCE_WITH_USER)
        .eq("day_key", dayKey)
        .order("created_at", { ascending: true }),
    );

    if (response.error) {
      throw new DatabaseError("listByDay", response.status, response.error.message);
    }

    return AttendanceResponse.toDomainList(response.data, "listByDay");
  }

  // claim_pending trava e adia as linhas; o PostgREST embute o hg_users na resposta da função
  async claimPending(filter: IClaimPendingFilter): Promise<Attendance[]> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("claim_pending", ClaimPendingRequest.fromDomain(filter)).select(ATTENDANCE_WITH_USER),
    );

    if (response.error) {
      throw new DatabaseError("claim_pending", response.status, response.error.message);
    }

    return AttendanceResponse.toDomainList(response.data, "claim_pending");
  }

  // trava do updated_at na função marcar_sync
  async markSync(data: IMarkSyncData): Promise<boolean> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("marcar_sync", MarkSyncRequest.fromDomain(data)),
    );

    if (response.error) {
      throw new DatabaseError("marcar_sync", response.status, response.error.message);
    }

    return SavedResponse.toDomain(response.data, "marcar_sync");
  }

  // travas de changedAt e da mudança local mais nova na função aplicar_validacao
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async applyValidation(data: IApplyValidationData): Promise<ApplyValidationResult> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("aplicar_validacao", ApplyValidationRequest.fromDomain(data)),
    );

    if (response.error) {
      throw new DatabaseError("aplicar_validacao", response.status, response.error.message);
    }

    return ApplyValidationResponse.toDomain(response.data, "aplicar_validacao");
  }

  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async saveVacancies(data: ISaveVacanciesData): Promise<boolean> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("gravar_vagas", SaveVacanciesRequest.fromDomain(data)),
    );

    if (response.error) {
      throw new DatabaseError("gravar_vagas", response.status, response.error.message);
    }

    return SavedResponse.toDomain(response.data, "gravar_vagas");
  }

  // insert ... on conflict do nothing: sem linha de volta = entrega repetida
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async registerWebhookDelivery(data: IWebhookDeliveryData): Promise<boolean> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_webhook_deliveries")
        .upsert(RegisterWebhookDeliveryRequest.fromDomain(data), { onConflict: "delivery_id", ignoreDuplicates: true })
        .select("delivery_id"),
    );

    if (response.error) {
      throw new DatabaseError("registerWebhookDelivery", response.status, response.error.message);
    }

    return WebhookDeliveryResponse.toDomain(response.data, "registerWebhookDelivery");
  }

  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  async releaseWebhookDelivery(deliveryId: string): Promise<void> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.from("hg_webhook_deliveries").delete().eq("delivery_id", deliveryId),
    );

    if (response.error) {
      throw new DatabaseError("releaseWebhookDelivery", response.status, response.error.message);
    }
  }
}
