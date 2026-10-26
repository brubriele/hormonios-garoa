import {
  type AppError,
  BookingClosedError,
  NotFoundError,
  ReservationRejectedError,
  SoldOutError,
  StockBelowReservationsError,
  UpstreamUnavailableError,
} from "../../errors/app-error";
import { HttpClient, HttpMethod } from "../../clients/http-client";
import type { IClientResponse } from "../../interfaces/client-response";
import type {
  IAddGroupsData,
  IEventChanges,
  IEventRef,
  IManagedEventItem,
  INewEventData,
  ISendBookingData,
  ISendBookingPerson,
  ITransicionaisAccount,
  ITransicionaisErrorCause,
  ITransicionaisPresence,
  ITransicionaisRepo,
  ITransicionaisWebhook,
} from "../../interfaces/transicionais";
import type { EventDay } from "../../models/event-day";
import type { CurrentEventSnapshot } from "../../models/current-event-snapshot";
import type { ManagedEvent } from "../../models/managed-event";
import type { LoanCatalog } from "../../models/loan-catalog";
import { WebhookType } from "../../models/transicionais-webhook";
import {
  AnswerChangedError,
  UpstreamBadContractError,
  UpstreamResponseError,
  VersionConflictError,
} from "../../errors/infra-error";
import { createLogger } from "../../lib/logger";
import { isBadContract, isUnavailable } from "../../lib/upstream";
import { DeleteEventsRequest } from "./requests/delete-events.request";
import { EventCategoryRequest } from "./requests/event-category.request";
import { EventCreateRequest } from "./requests/event-create.request";
import { EventDaysRequest } from "./requests/event-days.request";
import { EventGroupsRequest } from "./requests/event-groups.request";
import { EventUpdateRequest } from "./requests/event-update.request";
import { GuestAccountRequest } from "./requests/guest-account.request";
import { LoanCatalogUpdateRequest } from "./requests/loan-catalog-update.request";
import { ValidationChangeRequest } from "./requests/validation-change.request";
import { CreatedEventResponse } from "./responses/created-event.response";
import { ErrorBodyResponse } from "./responses/error-body.response";
import { EventDayResponse } from "./responses/event-day.response";
import { EventListResponse } from "./responses/event-list.response";
import { EventSummaryResponse } from "./responses/event-summary.response";
import { EventUpdatedResponse } from "./responses/event-updated.response";
import { GuestAccountResponse } from "./responses/guest-account.response";
import { GuestPresenceResponse } from "./responses/guest-presence.response";
import { ManagedEventResponse } from "./responses/managed-event.response";
import { PublicEventResponse } from "./responses/public-event.response";
import { LoanCatalogResponse } from "./responses/loan-catalog.response";
import { ValidationChangedResponse } from "./responses/validation-changed.response";
import { VersionResponse } from "./responses/version.response";
import { WebhookEnvelopeResponse } from "./responses/webhook-envelope.response";
import { TransicionaisSession } from "./session";
import { TransicionaisUrlCollection } from "./url-collection";

const logger = createLogger("TransicionaisRepo");

// key do Transicionais -> AppError do Hormônios, nas ações da Produção (R11)
const TRANSICIONAIS_ERRORS: Record<string, () => AppError> = {
  EXTERNAL_GROUP_CAPACITY_BELOW_TAKEN: () => new StockBelowReservationsError("Stock is below its reservations"),
  EXTERNAL_CAPACITY_BELOW_TAKEN: () => new StockBelowReservationsError("Stock is below its reservations"),
  EVENT_NOT_FOUND: () => new NotFoundError("Current event Not Found"),
  EXTERNAL_EVENT_NOT_FOUND: () => new NotFoundError("Current event Not Found"),
  SUPPORT_TYPE_NOT_FOUND: () => new NotFoundError("Support Not Found"),
};

// envio da reserva: key do Transicionais -> AppError do Hormônios; o usecase grava REJECTED (tabela
// "Tradução das keys do Transicionais" de bff-fase-2-implementacao.md): as de convidado (profileGuestId)
// e as de membro (profileId, D41)
const SEND_REJECTIONS: Record<string, () => AppError> = {
  VALIDATION_GUEST_GROUP_FULL: () => new SoldOutError("Group is sold out"),
  VALIDATION_GUEST_EVENT_FULL: () => new SoldOutError("Event is sold out"),
  VALIDATION_GUEST_FREE_SEATS_FULL: () => new SoldOutError("Free seats are sold out"),
  VALIDATION_GROUP_FULL: () => new SoldOutError("Group is sold out"),
  VALIDATION_EVENT_FULL: () => new SoldOutError("Event is sold out"),
  VALIDATION_GUEST_ANSWER_CLOSED: () => new BookingClosedError("Booking is closed"),
  VALIDATION_GUEST_ANSWER_NOT_OPEN: () => new BookingClosedError("Booking is not open"),
  VALIDATION_ANSWER_DEADLINE_PASSED: () => new BookingClosedError("Booking is closed"),
  VALIDATION_MEMBER_ANSWER_NOT_OPEN: () => new BookingClosedError("Booking is not open"),
  VALIDATION_DAY_INACTIVE: () => new BookingClosedError("Day is inactive"),
};
// a resposta mudou ao mesmo tempo em outro lugar (VAL-19): AnswerChangedError
const SEND_ANSWER_CHANGED_KEY = "VALIDATION_ANSWER_CHANGED";
// conta do BFF sem o papel ADMIN/MANAGER: a rota fica escondida (404). É configuração, não recusa
const SEND_HIDDEN_ROUTE_KEY = "NOT_FOUND";
// outro 400/404/409/422 é recusa de regra: RESERVATION_REJECTED_ERROR
const SEND_REJECTED_STATUSES = [400, 404, 409, 422];
// 401/403: a sessão renova o token uma vez e reenvia
const SEND_RENEW_ON = [401, 403];
const SEND_OPERATION = "validationChange";
const REGISTER_OPERATION = "registerGuest";
const PRESENCE_OPERATION = "guestPresence";

// EVENT_VERSION_CONFLICT: VersionConflictError; o usecase lê a version de novo e tenta uma vez mais
const VERSION_CONFLICT_KEY = "EVENT_VERSION_CONFLICT";

function errorKey(response: IClientResponse<unknown>): string | undefined {
  return ErrorBodyResponse.toDomain(response.error?.details).key;
}

// o erro do Transicionais como veio, para gravar (D50)
function errorCause(response: IClientResponse<unknown>, operation: string): ITransicionaisErrorCause {
  return ErrorBodyResponse.toCause(response.error?.details, response.status, operation);
}

export class TransicionaisRepo implements ITransicionaisRepo {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly session: TransicionaisSession,
  ) {}

  // GET v2/manager-events/details?visibility=PUBLIC&startAt=<date>: os encontros Públicos de date em
  // diante, na ordem de startAt. Qual deles é o atual é regra do usecase (E2.7)
  async listPublicEventsFrom(date: string): Promise<IEventRef[]> {
    return EventSummaryResponse.toDomain(await this.requestPublicEvents(date));
  }

  // GET público do encontro: grupos, local, horário, janela, assistências com o estoque do dia e
  // version (E2.9). 404 -> null; fora do ar -> UpstreamUnavailableError
  async findPublicEvent(ref: IEventRef): Promise<CurrentEventSnapshot | null> {
    const vacanciesAt = new Date().toISOString(); // a hora da leitura (D5)
    const response = await this.httpClient.get<unknown>(TransicionaisUrlCollection.publicEvent(ref.externalId, ref.dayId));

    if (response.status === 404) {
      return null;
    }

    if (isUnavailable(response.status)) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }

    if (response.error || response.data === undefined) {
      throw this.readError(response, "publicEvent", errorKey(response));
    }

    return PublicEventResponse.toDomain(response.data, ref, vacanciesAt);
  }

  private async requestPublicEvents(date: string): Promise<unknown> {
    return this.assertWrite(
      await this.session.request<unknown>({ url: TransicionaisUrlCollection.publicEventsFrom(date) }),
      "listEvents",
    );
  }

  // ------------ escritas da Produção (E2.5): operações simples; a regra é do usecase (R12) ---------

  // o id interno sai da listagem dos Públicos de from em diante (pelo externalId); o resto, do completo
  async findManagedEvent(ref: IEventRef, from: string): Promise<ManagedEvent | null> {
    const summary = EventSummaryResponse.parse(await this.requestPublicEvents(from)).find(
      (item) => item.externalId === ref.externalId,
    );

    return summary ? this.findManagedEventById(String(summary.id)) : null;
  }

  async findManagedEventById(eventId: string): Promise<ManagedEvent> {
    return ManagedEventResponse.toDomain(
      this.assertWrite(
        await this.session.request<unknown>({ url: TransicionaisUrlCollection.eventById(eventId) }),
        "findEventDetails",
      ),
    );
  }

  async listEventsFrom(date: string): Promise<IManagedEventItem[]> {
    return EventListResponse.toDomain(
      this.assertWrite(
        await this.session.request<unknown>({ url: TransicionaisUrlCollection.eventsFrom(date) }),
        "listEvents",
      ),
    );
  }

  async listDays(eventId: string): Promise<EventDay[]> {
    return EventDayResponse.toDomain(
      this.assertWrite(
        await this.session.request<unknown>({ url: TransicionaisUrlCollection.eventDays(eventId) }),
        "listDays",
      ),
      "listDays",
    );
  }

  async createEvent(data: INewEventData): Promise<string | null> {
    return CreatedEventResponse.toDomain(
      this.assertWrite(
        await this.session.request<unknown>({
          method: HttpMethod.Post,
          url: TransicionaisUrlCollection.events(),
          body: EventCreateRequest.fromDomain(data),
        }),
        "createEvent",
      ),
    );
  }

  async setCategory(eventId: string, categoryId: string): Promise<void> {
    this.assertWrite(
      await this.session.request<unknown>({
        method: HttpMethod.Put,
        url: TransicionaisUrlCollection.eventCategory(eventId),
        body: EventCategoryRequest.fromDomain(categoryId),
      }),
      "updateCategory",
    );
  }

  async addGroups(eventId: string, data: IAddGroupsData): Promise<number> {
    return VersionResponse.toDomain(
      this.assertWrite(
        await this.session.request<unknown>({
          method: HttpMethod.Put,
          url: TransicionaisUrlCollection.eventGroups(eventId),
          body: EventGroupsRequest.fromDomain(data),
        }),
        "addGroups",
      ),
      "addGroups",
    );
  }

  async saveEvent(eventId: string, version: number, changes: IEventChanges): Promise<number> {
    return VersionResponse.toDomain(
      this.assertWrite(
        await this.session.request<unknown>({
          method: HttpMethod.Put,
          url: TransicionaisUrlCollection.eventById(eventId),
          body: EventUpdateRequest.fromDomain(version, changes),
        }),
        "updateEvent",
      ),
      "updateEvent",
    );
  }

  async saveDays(eventId: string, version: number, days: EventDay[]): Promise<number> {
    return VersionResponse.toDomain(
      this.assertWrite(
        await this.session.request<unknown>({
          method: HttpMethod.Put,
          url: TransicionaisUrlCollection.eventDays(eventId),
          body: EventDaysRequest.fromDomain(version, days),
        }),
        "saveDays",
      ),
      "saveDays",
    );
  }

  async deleteEvent(eventId: string): Promise<void> {
    this.assertWrite(
      await this.session.request<unknown>({
        method: HttpMethod.Post,
        url: TransicionaisUrlCollection.deleteEvents(),
        body: DeleteEventsRequest.fromDomain(eventId),
      }),
      "deleteEvent",
    );
  }

  // GET v2/manager-support-types/{id}: 404 -> null
  async findLoanCatalog(supportId: string): Promise<LoanCatalog | null> {
    const response = await this.session.request<unknown>({ url: TransicionaisUrlCollection.loanCatalog(supportId) });

    if (response.status === 404) {
      return null;
    }

    return LoanCatalogResponse.toDomain(this.assertWrite(response, "findLoanCatalog"));
  }

  // PUT inteiro (D26). O corpo da resposta não importa (pode vir vazio): qualquer 2xx vale
  async saveLoanCatalog(loanCatalog: LoanCatalog): Promise<void> {
    const response = await this.session.request<unknown>({
      method: HttpMethod.Put,
      url: TransicionaisUrlCollection.loanCatalog(loanCatalog.id),
      body: LoanCatalogUpdateRequest.fromDomain(loanCatalog),
    });

    if (response.status === 404) {
      throw new NotFoundError("Support Not Found");
    }

    if (!response.error && response.status >= 200 && response.status < 300) {
      return;
    }

    this.assertWrite(response, "saveLoanCatalog");
  }

  // ações da Produção: fora do ar -> 503; key conhecida -> AppError; conflito de versão ->
  // VersionConflictError (o usecase tenta de novo); o resto -> UpstreamResponseError (R8, R11)
  private assertWrite(response: IClientResponse<unknown>, operation: string): unknown {
    if (isUnavailable(response.status)) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }

    const error = ErrorBodyResponse.toDomain(response.error?.details);

    if (error.key === VERSION_CONFLICT_KEY) {
      throw new VersionConflictError(operation);
    }

    const knownError = error.key ? TRANSICIONAIS_ERRORS[error.key] : undefined;

    if (knownError) {
      throw knownError();
    }

    if (response.error || response.data === undefined) {
      // a message do Transicionais diz o campo recusado (REQUEST_ERROR)
      const message = JSON.stringify(error.message ?? response.error?.message);

      throw this.readError(response, operation, `${error.key} ${message}`);
    }

    return response.data;
  }

  // 400, 409 ou 422: UpstreamBadContractError; o resto: UpstreamResponseError. Os dois levam o erro
  // como veio (D50)
  private readError(response: IClientResponse<unknown>, operation: string, detail: string | undefined): Error {
    const cause = errorCause(response, operation);

    return isBadContract(response.status)
      ? new UpstreamBadContractError(cause)
      : new UpstreamResponseError(operation, response.status, detail, cause);
  }

  // ------------ envio da reserva (E2.8) ---------

  // POST v2/manager-organization/users com o token de membro (D41): idempotente pelo e-mail, devolve a
  // conta que já existe (convidado ou membro). Falhas como no sendBooking
  async registerGuest(person: ISendBookingPerson): Promise<ITransicionaisAccount> {
    const response = await this.session.request<unknown>(
      {
        method: HttpMethod.Post,
        url: TransicionaisUrlCollection.organizationUsers(),
        body: GuestAccountRequest.fromDomain(person),
      },
      SEND_RENEW_ON,
    );

    if (isUnavailable(response.status)) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }

    if (response.error || response.status < 200 || response.status >= 300) {
      throw this.sendError(response, REGISTER_OPERATION);
    }

    return GuestAccountResponse.toDomain(response.data);
  }

  // GET v2/manager-validations/guests?configDayIds=&search=<email> com o token de membro (D49): a
  // presença da pessoa no dia, com o hash. null = ainda não respondeu. Falhas como no sendBooking
  async findPresence(dayKey: string, email: string): Promise<ITransicionaisPresence | null> {
    const response = await this.session.request<unknown>(
      { method: HttpMethod.Get, url: TransicionaisUrlCollection.guestPresence(dayKey, email) },
      SEND_RENEW_ON,
    );

    if (isUnavailable(response.status)) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }

    if (response.error || response.status < 200 || response.status >= 300) {
      throw this.sendError(response, PRESENCE_OPERATION);
    }

    return GuestPresenceResponse.toDomain(response.data, email);
  }

  // POST v2/manager-validations/change com o token de membro, em nome da conta da pessoa (D41).
  // 401/403: a sessão renova o token uma vez e reenvia (D40). Qualquer 2xx é aceito (APPROVED ou
  // ALREADY). O que fazer com cada falha é do usecase
  async sendBooking(data: ISendBookingData): Promise<void> {
    const response = await this.session.request<unknown>(
      {
        method: HttpMethod.Post,
        url: TransicionaisUrlCollection.validationChange(),
        body: ValidationChangeRequest.fromDomain(data),
        headers: data.ip ? { "x-forwarded-for": data.ip } : undefined,
      },
      SEND_RENEW_ON,
    );

    if (isUnavailable(response.status)) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }

    if (response.error || response.status < 200 || response.status >= 300) {
      throw this.sendError(response, SEND_OPERATION, data.bookingId);
    }
  }

  // tabela "Tradução das keys do Transicionais" (envio da reserva, R11)
  private sendError(response: IClientResponse<unknown>, operation: string, bookingId?: string): Error {
    const key = errorKey(response);

    // continuou 401/403 depois de renovar, ou a rota escondida: é configuração, não culpa da pessoa
    if (SEND_RENEW_ON.includes(response.status) || key === SEND_HIDDEN_ROUTE_KEY) {
      return new UpstreamResponseError(operation, response.status, key, errorCause(response, operation));
    }

    if (key === SEND_ANSWER_CHANGED_KEY) {
      return new AnswerChangedError(operation);
    }

    // 400, 409 ou 422: o contrato foi recusado; o usecase grava o erro e MANUAL_RETRY (D50)
    if (isBadContract(response.status)) {
      return new UpstreamBadContractError(errorCause(response, operation));
    }

    const knownError = key ? SEND_REJECTIONS[key] : undefined;

    if (knownError) {
      return knownError();
    }

    if (SEND_REJECTED_STATUSES.includes(response.status)) {
      logger.error({ operation, bookingId, status: response.status, key }, "booking rejected by an unknown rule");
      return new ReservationRejectedError("Reservation was rejected");
    }

    return new UpstreamResponseError(operation, response.status, key, errorCause(response, operation));
  }

  // ------------ webhooks ---------

  // envelope { deliveryId, type, occurredAt, organizationId, data } (bff-fase-2.md, "Webhooks")
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  parseWebhook(body: unknown, current: IEventRef | null): ITransicionaisWebhook {
    const envelope = WebhookEnvelopeResponse.toDomain(body);

    if (envelope.type === WebhookType.EventUpdated) {
      return {
        type: WebhookType.EventUpdated,
        deliveryId: envelope.deliveryId,
        result: EventUpdatedResponse.toDomain(body, current),
      };
    }

    if (envelope.type === WebhookType.ValidationChanged) {
      return {
        type: WebhookType.ValidationChanged,
        deliveryId: envelope.deliveryId,
        validation: ValidationChangedResponse.toDomain(body),
      };
    }

    return { type: WebhookType.Other, deliveryId: envelope.deliveryId, rawType: envelope.rawType };
  }
}
