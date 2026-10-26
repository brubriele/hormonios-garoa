import type { ErrorKey } from "../errors/app-error";
import type { ApplyValidationResult, Booking, BookingAnswer, SyncMode } from "../models/booking";
import type { CurrentEvent } from "../models/current-event";
import type { EventSnapshot } from "../models/event-snapshot";
import type { PendingNextEvent } from "../models/pending-next-event";
import type { PendingSupportCapacity } from "../models/pending-support-capacity";
import type { PendingWriteMode } from "../models/pending-write";
import type { User } from "../models/user";
import type { ITransicionaisErrorCause } from "./transicionais";
import type { UUID } from "./uuid";

// o formato cru fica nos schemas de repos/supabase/responses/ e requests/

export interface IUpsertUserData {
  email: string; // já normalizado
  name: string;
  pronoun: string;
}

export interface ICreateBookingData {
  user: User;
  dayKey: string;
  deviceId: UUID;
  groupId: string | null; // null = só presença
  supportIds: string[];
}

export interface ICancelByDeviceFilter {
  dayKey: string;
  deviceId: UUID;
  bookingId: UUID;
}

export interface IListByDeviceFilter {
  dayKey: string;
  deviceId: UUID;
}

// de-para dos dias: as linhas do dia antigo passam para o novo, como PENDING (E2.2)
export interface IMoveBookingsData {
  oldDayKey: string;
  newDayKey: string;
  groupMap: Record<string, string>; // groupId antigo -> novo; fora do mapa vira só presença
}

// todos os dias do Transicionais; os da fase 1 (day_key UUID) ficam de fora na função (D45)
export interface IClaimPendingFilter {
  limit: number;
}

// a trava do envio: grava só se a linha ainda é a enviada (marcar_sync)
export interface IMarkSyncLock {
  bookingId: UUID;
  updatedAt: string; // o lido antes do envio
}

export interface IMarkSyncedData extends IMarkSyncLock {
  mode: SyncMode.Synced;
  orderId: string | null;
  changedAt: string | null;
  guestId: string | null;
  hash: string | null; // md5 da presença no Transicionais (D49); null = não foi lido
}

export interface IMarkRejectedData extends IMarkSyncLock {
  mode: SyncMode.Rejected;
  error: ErrorKey; // key do Hormônios
}

export interface IMarkPendingData extends IMarkSyncLock {
  mode: SyncMode.Retry | SyncMode.Backoff; // próximo ciclo | próximo ciclo, contando a tentativa (D46)
  errorCause: ITransicionaisErrorCause | null; // o erro do Transicionais como veio (D50); null = sem resposta
}

export interface IMarkManualRetryData extends IMarkSyncLock {
  mode: SyncMode.ManualRetry; // 400, 409 ou 422: sai do cron até o ajuste manual (D50)
  errorCause: ITransicionaisErrorCause;
}

// resultado de um envio ao Transicionais, gravado só se a linha ainda é a enviada (marcar_sync)
export type IMarkSyncData = IMarkSyncedData | IMarkRejectedData | IMarkPendingData | IMarkManualRetryData;

// falha na leitura do encontro (D50): o erro como veio; manualRetry = 400, 409 ou 422
export interface IMarkEventErrorData {
  manualRetry: boolean;
  errorCause: ITransicionaisErrorCause;
}

// webhook validation.changed, já no formato do Hormônios
export interface IApplyValidationData {
  orderId: string | null;
  dayKey: string;
  guestId: string | null;
  email: string | null;
  answer: BookingAnswer;
  groupId: string | null;
  supportIds: string[]; // só os acessórios
  changedAt: string;
}

// ocupado do dia que veio num webhook: groupId -> taken do instrumento, supportId -> taken do acessório
export interface ISaveVacanciesData {
  dayKey: string;
  vacanciesAt: string;
  groups: Record<string, number>;
  supports: Record<string, number>;
}

// estoque com o Transicionais fora (D53): enfileira e grava o retrato já com ele
export interface ISavePendingCapacityData {
  supportId: string;
  capacity: number;
  event: CurrentEvent; // o retrato com o estoque novo
}

// "Encerrar ensaio" com o Transicionais fora (D51): o próximo, só no local, e o encontro de origem
export interface ICloseEventLocallyData {
  event: CurrentEvent; // o próximo (dia local, sem externalId)
  fromExternalId: string;
  fromDayKey: string;
  fromDate: string; // YYYY-MM-DD
}

export interface IClaimPendingWritesFilter {
  limit: number;
}

// resultado de um envio da fila da Produção, gravado só se a linha ainda é a enviada (marcar_escrita)
export interface IMarkWriteData {
  id: UUID;
  updatedAt: string; // o lido antes do envio
  mode: PendingWriteMode;
  error: ErrorKey | null; // key do Hormônios, só no REJECTED
  errorCause: ITransicionaisErrorCause | null; // o erro do Transicionais como veio (D50); null = sem resposta
}

export interface IWebhookDeliveryData {
  deliveryId: string;
  type: string;
}

export interface IHormoniosRepo {
  findCurrentEvent(): Promise<CurrentEvent | null>;
  findCurrentEventOrFail(): Promise<CurrentEvent>;
  // grava o retrato com a trava; true quando trocou
  saveSnapshot(snapshot: EventSnapshot): Promise<boolean>;
  // grava o erro da leitura do encontro na linha do retrato e, com manualRetry, o MANUAL_RETRY (D50)
  markEventError(data: IMarkEventErrorData): Promise<void>;
  saveWhatsappUrl(url: string): Promise<void>;
  moveBookings(data: IMoveBookingsData): Promise<number>;
  upsertUserByEmail(data: IUpsertUserData): Promise<User>;
  createBooking(data: ICreateBookingData): Promise<Booking>;
  // devolve a linha cancelada (PENDING), para o envio
  cancelByDevice(filter: ICancelByDeviceFilter): Promise<Booking>;
  listByDevice(filter: IListByDeviceFilter): Promise<Booking[]>;
  listByDay(dayKey: string): Promise<Booking[]>;
  // cron de sincronização: as linhas PENDING vencidas de qualquer dia do Transicionais, com o
  // next_attempt_at adiado
  claimPending(filter: IClaimPendingFilter): Promise<Booking[]>;
  // true quando gravou (a linha não mudou durante o envio)
  markSync(data: IMarkSyncData): Promise<boolean>;
  // fila da Produção (D51–D53). A troca da pendente e a trava do retrato ficam na função SQL
  savePendingCapacity(data: ISavePendingCapacityData): Promise<void>;
  // já há um encerramento aberto: NextEventPendingError
  closeEventLocally(data: ICloseEventLocallyData): Promise<void>;
  // o encerramento ainda não criado no Transicionais (PENDING ou MANUAL_RETRY); null = nenhum
  findOpenNextEvent(): Promise<PendingNextEvent | null>;
  listPendingCapacities(): Promise<PendingSupportCapacity[]>;
  // as pendentes vencidas de cada tipo, com o next_attempt_at adiado (claim_escritas)
  claimPendingCapacities(filter: IClaimPendingWritesFilter): Promise<PendingSupportCapacity[]>;
  claimPendingNextEvents(filter: IClaimPendingWritesFilter): Promise<PendingNextEvent[]>;
  // true quando gravou (a linha não mudou durante o envio)
  markWrite(data: IMarkWriteData): Promise<boolean>;
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  applyValidation(data: IApplyValidationData): Promise<ApplyValidationResult>;
  // true quando gravou (vagas mais novas que as do retrato)
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  saveVacancies(data: ISaveVacanciesData): Promise<boolean>;
  // false quando a entrega já foi recebida (deduplicação)
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  registerWebhookDelivery(data: IWebhookDeliveryData): Promise<boolean>;
  // desfaz o registro de uma entrega que falhou, para o reenvio do Transicionais processar
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  releaseWebhookDelivery(deliveryId: string): Promise<void>;
}
