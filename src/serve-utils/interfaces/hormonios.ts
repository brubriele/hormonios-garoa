import type { Attendance, AttendanceAnswer, AttendanceSync } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { EventSnapshot } from "../models/event-snapshot";
import type { User } from "../models/user";
import type { UUID } from "./uuid";

// formatos crus do Supabase; nunca saem do repo

export interface IRawUser {
  id: UUID;
  email: string;
  name: string;
  pronoun: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// jsonb do retrato (hg_current_event.data): os nomes são os que a função reservar lê (0003)
export interface IRawGroup {
  id: string;
  name: string;
  stockTotal: number | null; // null = sem limite
  active: boolean;
  taken?: number; // só no retrato do Transicionais: occupied do instrumento no dia
  instrumentSupportId?: string | null; // só no retrato do Transicionais: assistência do instrumento
  rotativo?: boolean; // ausente (fase 1) = false
}

// campos novos ausentes no retrato da fase 1: sem limite, não rotativo, vale para todos os grupos
export interface IRawSupport {
  id: string;
  name: string;
  stockTotal?: number | null; // null ou ausente = sem limite
  taken?: number; // só no retrato do Transicionais: occupied do acessório no dia
  rotativo?: boolean;
  groupIds?: string[]; // vazio ou ausente = todos os grupos
}

export interface IRawCurrentEventData {
  dayKey: string;
  date: string;
  time: string;
  location: string;
  bookingOpen: boolean;
  whatsappUrl: string;
  groups: IRawGroup[];
  supports: IRawSupport[];
}

export interface IRawCurrentEvent {
  id: number;
  data: IRawCurrentEventData;
  external_id: string | null;
  version: number | null;
  vacancies_at: string | null;
  fetched_at: string | null;
  updated_at: string;
}

export interface IRawAttendanceData {
  answer: AttendanceAnswer;
  groupId: string | null;
  supportIds: string[];
}

export interface IRawAttendance {
  id: UUID;
  user_id: UUID;
  day_key: string;
  device_id: UUID;
  data: IRawAttendanceData;
  transicionais_sync: AttendanceSync;
  transicionais_order_id: string | null;
  transicionais_changed_at: string | null;
  sync_error: string | null;
  attempts: number;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
}

// hg_attendances com o hg_users embutido (select "*, hg_users(*)")
export interface IRawAttendanceWithUser extends IRawAttendance {
  hg_users: IRawUser;
}

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

export interface IClaimPendingFilter {
  dayKey: string; // só o dia atual (D11)
  limit: number;
}

// resultado de um envio ao Transicionais, gravado só se a linha ainda é a enviada (marcar_sync)
export type IMarkSyncData =
  | {
    mode: "SYNCED";
    attendanceId: UUID;
    updatedAt: string; // o lido antes do envio
    orderId: string | null;
    changedAt: string | null;
    guestId: string | null;
  }
  | { mode: "REJECTED"; attendanceId: UUID; updatedAt: string; error: string } // key do Hormônios
  | { mode: "RETRY" | "BACKOFF"; attendanceId: UUID; updatedAt: string }; // próximo ciclo | espera crescente

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

// APPLIED: gravou; STALE: o webhook é mais velho; LOCAL_NEWER: a mudança local é mais nova;
// UNKNOWN_PERSON: fora de hg_users (B6); NO_ROW: a pessoa não tem linha no dia
export type IApplyValidationResult = "APPLIED" | "STALE" | "LOCAL_NEWER" | "UNKNOWN_PERSON" | "NO_ROW";

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
  saveWhatsappUrl(url: string): Promise<void>;
  moveAttendances(data: IMoveAttendancesData): Promise<number>;
  upsertUserByEmail(data: IUpsertUserData): Promise<User>;
  reserve(data: IReserveData): Promise<Attendance>;
  // devolve a linha cancelada (PENDING), para o envio
  cancelByDevice(filter: ICancelByDeviceFilter): Promise<Attendance>;
  listByDevice(filter: IListByDeviceFilter): Promise<Attendance[]>;
  listByDay(dayKey: string): Promise<Attendance[]>;
  // cron de sincronização: as linhas PENDING vencidas do dia, com o next_attempt_at adiado
  claimPending(filter: IClaimPendingFilter): Promise<Attendance[]>;
  // true quando gravou (a linha não mudou durante o envio)
  markSync(data: IMarkSyncData): Promise<boolean>;
  // em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
  /** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
  applyValidation(data: IApplyValidationData): Promise<IApplyValidationResult>;
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
