import type { AttendanceAnswer } from "../models/attendance";
import type { EventDay } from "../models/event-day";
import type { EventPublication } from "../models/event-publication";
import type { EventSnapshot } from "../models/event-snapshot";
import type { ManagedEvent } from "../models/managed-event";
import type { SupportType } from "../models/support-type";
import type { EventWebhookStatus, WebhookType } from "../models/transicionais-webhook";
import type { UUID } from "./uuid";

// a pessoa da reserva, em nome de quem o BFF envia
export interface ISendAttendancePerson {
  email: string;
  name: string;
  pronoun: string;
}

// envio da reserva (E2.8): o estado atual da linha
export interface ISendAttendanceData {
  attendanceId: UUID;
  updatedAt: string; // entra na idempotencyKey (<id>:<updated_at>)
  dayKey: string; // = configDayId
  answer: AttendanceAnswer;
  groupId: string | null; // null = só presença
  supportTypeIds: string[]; // assistência do instrumento + acessórios (E2.9); vazio sem grupo ou "não vou"
  person: ISendAttendancePerson;
  ip: string | null; // IP real (H11); no cron, null
}

// envio aceito: os ids do Transicionais e quando ele gravou; null = não veio na resposta (dúvida D33)
export interface ISentAttendance {
  guestId: string | null;
  orderId: string | null;
  changedAt: string | null;
}

// envelope de um webhook já validado; rawType = o type como veio (WebhookType.Other para o desconhecido)
export interface IWebhookEnvelope {
  deliveryId: string;
  type: WebhookType;
  rawType: string;
}

// validation.changed já traduzido; o occupied é do dia, por assistência (supportId -> ocupado)
export interface IWebhookValidation {
  orderId: string | null;
  dayKey: string;
  guestId: string | null;
  email: string | null;
  answer: AttendanceAnswer;
  groupId: string | null;
  supportTypeIds: string[]; // instrumento + acessórios, como no Transicionais
  changedAt: string;
  occupied: Record<string, number> | null;
}

export interface IEventWebhookSnapshot {
  status: EventWebhookStatus.Snapshot;
  snapshot: EventSnapshot;
}

export interface IEventWebhookSkipped {
  status: EventWebhookStatus.OtherEvent | EventWebhookStatus.Unmappable;
}

export type IEventWebhookResult = IEventWebhookSnapshot | IEventWebhookSkipped;

export interface IEventUpdatedWebhook {
  type: WebhookType.EventUpdated;
  deliveryId: string;
  result: IEventWebhookResult;
}

export interface IValidationChangedWebhook {
  type: WebhookType.ValidationChanged;
  deliveryId: string;
  validation: IWebhookValidation;
}

export interface IOtherWebhook {
  type: WebhookType.Other;
  deliveryId: string;
  rawType: string;
}

export type ITransicionaisWebhook = IEventUpdatedWebhook | IValidationChangedWebhook | IOtherWebhook;

// encontro atual: o primeiro Público da listagem de manager (E2.7, revista)
export interface IEventRef {
  externalId: string;
  dayId: string; // = dayKey do Hormônios (String(configDayId))
}

// item da listagem de manager (todas as visibilidades): acha o encontro recém-criado (D18)
export interface IManagedEventItem {
  id: string; // id interno
  name: string;
  date: string; // YYYY-MM-DD (startAt)
  externalId: string | null; // null = Interno
}

// o encontro novo do "Encerrar ensaio": um dia só (D2)
export interface INewEventData {
  name: string;
  location: string;
  date: string; // YYYY-MM-DD
}

// os grupos esperados de um encontro
export interface IAddGroupsData {
  groupIds: string[];
  createdAt: string; // quando o encontro foi criado (o Transicionais conta os grupos a partir dele)
}

// o que muda no encontro; campo ausente = não mexe
export interface IEventChanges {
  location?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  publication?: EventPublication; // inteira (D4)
}

// as escritas da Produção são operações simples; trocar o dia, abrir/fechar, criar e desfazer e o
// novo intento depois de EVENT_VERSION_CONFLICT são do usecase (R12). Em todas: fora do ar ->
// UpstreamUnavailableError; key conhecida -> AppError (NotFoundError, StockBelowReservationsError);
// EVENT_VERSION_CONFLICT -> VersionConflictError; o resto -> UpstreamResponseError
export interface ITransicionaisRepo {
  // os encontros Públicos de date (YYYY-MM-DD) em diante, na ordem de startAt. Fora do ar ->
  // UpstreamUnavailableError
  listPublicEventsFrom(date: string): Promise<IEventRef[]>;
  // o retrato do encontro (GET público). null = não existe; fora do ar -> UpstreamUnavailableError
  findPublicEvent(ref: IEventRef): Promise<EventSnapshot | null>;
  // o encontro de ref na visão de manager (achado pelo externalId nos Públicos de from, YYYY-MM-DD, em
  // diante). null = não está na listagem
  findManagedEvent(ref: IEventRef, from: string): Promise<ManagedEvent | null>;
  // o encontro pelo id interno (GET details/{id})
  findManagedEventById(eventId: string): Promise<ManagedEvent>;
  // todos os encontros (Internos também) de date em diante, na ordem de startAt
  listEventsFrom(date: string): Promise<IManagedEventItem[]>;
  // os dias do encontro (salvos e disponíveis)
  listDays(eventId: string): Promise<EventDay[]>;
  // cria o encontro; devolve o id, ou null se a resposta não o trouxe (D18)
  createEvent(data: INewEventData): Promise<string | null>;
  // troca o ciclo do encontro
  setCategory(eventId: string, categoryId: string): Promise<void>;
  // adiciona os grupos esperados; devolve a version nova
  addGroups(eventId: string, data: IAddGroupsData): Promise<number>;
  // grava o que muda no encontro; devolve a version nova
  saveEvent(eventId: string, version: number, changes: IEventChanges): Promise<number>;
  // grava os dias (ativo e horário); devolve a version nova. O id do dia novo nasce aqui
  saveDays(eventId: string, version: number, days: EventDay[]): Promise<number>;
  // apaga o encontro (as presenças ficam guardadas no Transicionais)
  deleteEvent(eventId: string): Promise<void>;
  // o catálogo da assistência. null = não existe
  findSupportType(supportId: string): Promise<SupportType | null>;
  // grava o catálogo inteiro da assistência (D26). 404 -> NotFoundError
  saveSupportType(supportType: SupportType): Promise<void>;
  // envia o estado atual da reserva (E2.8). Recusa -> AppError da tabela "Tradução das keys"
  // (SoldOutError, BookingClosedError, ReservationRejectedError); fora do ar ->
  // UpstreamUnavailableError; VALIDATION_ANSWER_CHANGED -> AnswerChangedError; outro status ->
  // UpstreamResponseError. O que fazer com cada um (REJECTED, RETRY, BACKOFF) é do usecase
  sendAttendance(data: ISendAttendanceData): Promise<ISentAttendance>;
  // traduz o corpo de um webhook; current = o encontro do retrato (null = retrato local da fase 1).
  // Corpo inválido -> InvalidParameterError
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  parseWebhook(body: unknown, current: IEventRef | null): ITransicionaisWebhook;
}
