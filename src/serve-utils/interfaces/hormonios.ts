import type { ErrorKey } from "../errors/app-error";
import type { ApplyValidationResult, Attendance, AttendanceAnswer, SyncMode } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { EventSnapshot } from "../models/event-snapshot";
import type { User } from "../models/user";
import type { ITransicionaisErrorCause } from "./transicionais";
import type { UUID } from "./uuid";

// o formato cru fica nos schemas de repos/supabase/responses/ e requests/

export interface IUpsertUserData {
  email: string; // já normalizado
  name: string;
  pronoun: string;
}

export interface IReserveData {
  user: User;
  dayKey: string;
  deviceId: UUID;
  groupId: string | null; // null = só presença
  supportIds: string[];
}

export interface ICancelByDeviceFilter {
  dayKey: string;
  deviceId: UUID;
  attendanceId: UUID;
}

export interface IListByDeviceFilter {
  dayKey: string;
  deviceId: UUID;
}

// de-para dos dias: as linhas do dia antigo passam para o novo, como PENDING (E2.2)
export interface IMoveAttendancesData {
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
  attendanceId: UUID;
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
  answer: AttendanceAnswer;
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
  moveAttendances(data: IMoveAttendancesData): Promise<number>;
  upsertUserByEmail(data: IUpsertUserData): Promise<User>;
  reserve(data: IReserveData): Promise<Attendance>;
  // devolve a linha cancelada (PENDING), para o envio
  cancelByDevice(filter: ICancelByDeviceFilter): Promise<Attendance>;
  listByDevice(filter: IListByDeviceFilter): Promise<Attendance[]>;
  listByDay(dayKey: string): Promise<Attendance[]>;
  // cron de sincronização: as linhas PENDING vencidas de qualquer dia do Transicionais, com o
  // next_attempt_at adiado
  claimPending(filter: IClaimPendingFilter): Promise<Attendance[]>;
  // true quando gravou (a linha não mudou durante o envio)
  markSync(data: IMarkSyncData): Promise<boolean>;
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
