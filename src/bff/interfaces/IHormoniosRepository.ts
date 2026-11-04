import type { Attendance } from "../domain/Attendance";
import type { Event } from "../domain/Event";
import type { FindingInternalFilter } from "../domain/FindingInternalFilter";
import type { IntegrationEntity, IntegrationStatus } from "../domain/IntegrationStatus";
import type { ManagerEvent } from "../domain/ManagerEvent";
import type { SyncStatus } from "../domain/SyncStatus";
import type { User } from "../domain/User";

// um get por entidade, com filtro nomeado: o primeiro campo preenchido decide a busca
export interface IFindEventFilter {
  id?: string;
  integrationId?: number; // D7
  transicionaisDayId?: number;
  attendanceId?: string;
}

export interface IFindUserFilter {
  id?: string;
  email?: string;
  integrationId?: string; // D7
  event?: Event; // D16, spec-8 D4: traz as presenças da pessoa nesse evento
}

export interface IFindAttendanceFilter {
  event: Event;
  id?: string;
  integrationId?: number; // D7
}

export interface IHormoniosRepository {
  findEvent(filter: IFindEventFilter): Promise<Event | null>;
  // spec-8 D1, D2: current_event → event → attendance → user, numa query
  findCurrentEvent(filter: FindingInternalFilter): Promise<ManagerEvent | null>;
  createCurrentEvent(event: Event, isCurrent: boolean): Promise<void>; // spec-8 B4
  // spec-8 B1: null = não enviou
  updateCurrentEvent(event: Event, isActive: boolean | null, isCurrent: boolean | null, next: Event | null): Promise<Event>;
  createEvent(event: Event): Promise<Event>;
  updateEvent(event: Event): Promise<Event>;

  findUser(filter: IFindUserFilter): Promise<User | null>;
  createOrUpdateUser(user: User): Promise<User>; // D8

  findAttendance(filter: IFindAttendanceFilter): Promise<Attendance | null>;
  // todas as presenças do event, da mais antiga para a mais nova
  findEventAttendance(event: Event): Promise<Attendance[]>;
  createOrUpdateAttendance(attendance: Attendance, event: Event): Promise<Attendance>; // D8

  findIntegrationStatus(entity: IntegrationEntity, entityId: string): Promise<IntegrationStatus | null>;
  // status igual e nextSyncAt vencido (ou null), do syncAt mais antigo para o mais novo
  findDueIntegrationStatus(entity: IntegrationEntity, status: SyncStatus, now: Date, limit: number): Promise<IntegrationStatus[]>;
  createOrUpdateIntegrationStatus(integrationStatus: IntegrationStatus): Promise<IntegrationStatus>;

}
