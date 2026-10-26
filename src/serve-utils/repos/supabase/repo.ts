import {
  AccessorySoldOutError,
  AlreadyReservedError,
  AppError,
  BookingClosedError,
  EventChangedError,
  InvalidParameterError,
  EventCreationPendingError,
  NotFoundError,
  SoldOutError,
} from "../../errors/app-error";
import { SupabaseClient } from "../../clients/supabase-client";
import { ApplyValidationRequest } from "./requests/apply-validation.request";
import { CancelByDeviceRequest } from "./requests/cancel-by-device.request";
import { ClaimPendingRequest } from "./requests/claim-pending.request";
import { ClaimPendingSyncsRequest } from "./requests/claim-pending-syncs.request";
import { CloseEventLocallyRequest } from "./requests/close-event-locally.request";
import { MarkEventErrorRequest } from "./requests/mark-event-error.request";
import { MarkSyncRequest } from "./requests/mark-sync.request";
import { MarkPendingSyncRequest } from "./requests/mark-pending-sync.request";
import { MoveBookingsRequest } from "./requests/move-bookings.request";
import { RegisterWebhookDeliveryRequest } from "./requests/register-webhook-delivery.request";
import { CreateBookingRequest } from "./requests/create-booking.request";
import { SavePendingCapacityRequest } from "./requests/save-pending-capacity.request";
import { SaveSnapshotRequest } from "./requests/save-snapshot.request";
import { SaveVacanciesRequest } from "./requests/save-vacancies.request";
import { SaveWhatsappRequest } from "./requests/save-whatsapp.request";
import { UpsertUserRequest } from "./requests/upsert-user.request";
import { ApplyValidationResponse } from "./responses/apply-validation.response";
import { BookingResponse } from "./responses/booking.response";
import { CurrentEventResponse } from "./responses/current-event.response";
import { MovedCountResponse } from "./responses/moved-count.response";
import { PendingSyncResponse } from "./responses/pending-sync.response";
import { SavedResponse } from "./responses/saved.response";
import { UserResponse } from "./responses/user.response";
import { WebhookDeliveryResponse } from "./responses/webhook-delivery.response";
import type { ApplyValidationResult, Booking } from "../../models/booking";
import { DatabaseError } from "../../errors/infra-error";
import type { CurrentEvent } from "../../models/current-event";
import type { CurrentEventSnapshot } from "../../models/current-event-snapshot";
import type { PendingEventCreation } from "../../models/pending-event-creation";
import type { PendingStockUpdate } from "../../models/pending-stock-update";
import { PendingSyncKind } from "../../models/pending-sync";
import type { User } from "../../models/user";
import type {
  IApplyValidationData,
  ICancelByDeviceFilter,
  IClaimPendingFilter,
  IClaimPendingSyncsFilter,
  ICloseEventLocallyData,
  IHormoniosRepo,
  IListByDeviceFilter,
  IMarkEventErrorData,
  IMarkSyncData,
  IMarkPendingSyncData,
  IMoveBookingsData,
  ICreateBookingData,
  ISavePendingCapacityData,
  ISaveVacanciesData,
  IUpsertUserData,
  IWebhookDeliveryData,
} from "../../interfaces/hormonios";

const CURRENT_EVENT_ID = 1;
const BOOKING_WITH_USER = "*, hg_users(*)";
// fila da Produção: o encerramento aberto ainda não foi criado no Transicionais (D51)
const OPEN_EVENT_CREATION_STATUSES = ["PENDING", "MANUAL_RETRY"];
const PENDING_STATUS = "PENDING";

// codigos de raise exception da funcao encerrar_local
const CLOSE_EVENT_ERRORS: Record<string, () => AppError> = {
  EVENT_CREATION_PENDING: () => new EventCreationPendingError("Previous next event is still pending"),
};

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
  async saveSnapshot(snapshot: CurrentEventSnapshot): Promise<boolean> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("gravar_retrato", SaveSnapshotRequest.fromDomain(snapshot)),
    );

    if (response.error) {
      throw new DatabaseError("gravar_retrato", response.status, response.error.message);
    }

    return SavedResponse.toDomain(response.data, "gravar_retrato");
  }

  async markEventError(data: IMarkEventErrorData): Promise<void> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("marcar_erro_retrato", MarkEventErrorRequest.fromDomain(data)),
    );

    if (response.error) {
      throw new DatabaseError("marcar_erro_retrato", response.status, response.error.message);
    }
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

  async moveBookings(data: IMoveBookingsData): Promise<number> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("migrar_fase1", MoveBookingsRequest.fromDomain(data)),
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
  async createBooking(data: ICreateBookingData): Promise<Booking> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("reservar", CreateBookingRequest.fromDomain(data)).single(),
    );

    const knownError = response.error && SQL_ERRORS[response.error.message];

    if (knownError) {
      throw knownError();
    }

    if (response.error || !response.data) {
      throw new DatabaseError("reservar", response.status, response.error?.message);
    }

    return BookingResponse.toDomainForUser(response.data, data.user, "reservar");
  }

  // "Não vou": libera a vaga do instrumento; só a linha deste aparelho. Volta a PENDING, para o envio
  async cancelByDevice(filter: ICancelByDeviceFilter): Promise<Booking> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_attendances")
        .update(CancelByDeviceRequest.fromDomain(new Date().toISOString()))
        .eq("id", filter.bookingId)
        .eq("day_key", filter.dayKey)
        .eq("device_id", filter.deviceId)
        .select(BOOKING_WITH_USER),
    );

    if (response.error) {
      throw new DatabaseError("cancelByDevice", response.status, response.error.message);
    }

    const booking = BookingResponse.toDomainList(response.data, "cancelByDevice")[0];

    if (!booking) {
      throw new NotFoundError("Reservation Not Found");
    }

    return booking;
  }

  async listByDevice(filter: IListByDeviceFilter): Promise<Booking[]> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_attendances")
        .select(BOOKING_WITH_USER)
        .eq("day_key", filter.dayKey)
        .eq("device_id", filter.deviceId)
        .order("created_at", { ascending: true }),
    );

    if (response.error) {
      throw new DatabaseError("listByDevice", response.status, response.error.message);
    }

    return BookingResponse.toDomainList(response.data, "listByDevice");
  }

  async listByDay(dayKey: string): Promise<Booking[]> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_attendances")
        .select(BOOKING_WITH_USER)
        .eq("day_key", dayKey)
        .order("created_at", { ascending: true }),
    );

    if (response.error) {
      throw new DatabaseError("listByDay", response.status, response.error.message);
    }

    return BookingResponse.toDomainList(response.data, "listByDay");
  }

  // claim_pending trava e adia as linhas; o PostgREST embute o hg_users na resposta da função
  async claimPending(filter: IClaimPendingFilter): Promise<Booking[]> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("claim_pending", ClaimPendingRequest.fromDomain(filter)).select(BOOKING_WITH_USER),
    );

    if (response.error) {
      throw new DatabaseError("claim_pending", response.status, response.error.message);
    }

    return BookingResponse.toDomainList(response.data, "claim_pending");
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

  // a troca da pendente da mesma assistência e a trava do retrato ficam na função estoque_pendente
  async savePendingCapacity(data: ISavePendingCapacityData): Promise<void> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("estoque_pendente", SavePendingCapacityRequest.fromDomain(data)),
    );

    if (response.error) {
      throw new DatabaseError("estoque_pendente", response.status, response.error.message);
    }
  }

  // o retrato e a fila na mesma transação (encerrar_local); encerramento aberto: EVENT_CREATION_PENDING
  async closeEventLocally(data: ICloseEventLocallyData): Promise<void> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("encerrar_local", CloseEventLocallyRequest.fromDomain(data)),
    );

    const knownError = response.error && CLOSE_EVENT_ERRORS[response.error.message];

    if (knownError) {
      throw knownError();
    }

    if (response.error) {
      throw new DatabaseError("encerrar_local", response.status, response.error.message);
    }
  }

  async findOpenNextEvent(): Promise<PendingEventCreation | null> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_pending_syncs")
        .select("*")
        .eq("kind", PendingSyncKind.EventCreation)
        .in("status", OPEN_EVENT_CREATION_STATUSES)
        .limit(1),
    );

    if (response.error) {
      throw new DatabaseError("findOpenNextEvent", response.status, response.error.message);
    }

    return PendingSyncResponse.toEventCreation(response.data, "findOpenNextEvent");
  }

  async listPendingCapacities(): Promise<PendingStockUpdate[]> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk
        .from("hg_pending_syncs")
        .select("*")
        .eq("kind", PendingSyncKind.StockUpdate)
        .eq("status", PENDING_STATUS)
        .order("created_at", { ascending: true }),
    );

    if (response.error) {
      throw new DatabaseError("listPendingCapacities", response.status, response.error.message);
    }

    return PendingSyncResponse.toStockUpdates(response.data, "listPendingCapacities");
  }

  // claim_syncs trava e adia as linhas do tipo
  async claimPendingCapacities(filter: IClaimPendingSyncsFilter): Promise<PendingStockUpdate[]> {
    return PendingSyncResponse.toStockUpdates(
      await this.claimPendingSyncs(PendingSyncKind.StockUpdate, filter),
      "claim_syncs",
    );
  }

  async claimPendingNextEvents(filter: IClaimPendingSyncsFilter): Promise<PendingEventCreation[]> {
    return PendingSyncResponse.toEventCreations(
      await this.claimPendingSyncs(PendingSyncKind.EventCreation, filter),
      "claim_syncs",
    );
  }

  private async claimPendingSyncs(kind: PendingSyncKind, filter: IClaimPendingSyncsFilter): Promise<unknown> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("claim_syncs", ClaimPendingSyncsRequest.fromDomain(kind, filter)),
    );

    if (response.error) {
      throw new DatabaseError("claim_syncs", response.status, response.error.message);
    }

    return response.data;
  }

  // trava do updated_at na função marcar_sync_pendente
  async markPendingSync(data: IMarkPendingSyncData): Promise<boolean> {
    const response = await this.supabaseClient.query<unknown>((sdk) =>
      sdk.rpc("marcar_sync_pendente", MarkPendingSyncRequest.fromDomain(data)),
    );

    if (response.error) {
      throw new DatabaseError("marcar_sync_pendente", response.status, response.error.message);
    }

    return SavedResponse.toDomain(response.data, "marcar_sync_pendente");
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
