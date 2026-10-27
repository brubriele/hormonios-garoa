import type { Attendance } from "../domain/Attendance";
import type { Event } from "../domain/Event";
import type { IntegrationEntity, IntegrationStatus } from "../domain/IntegrationStatus";
import type { User } from "../domain/User";

export interface IHormoniosRepository {
  // o evento pelo id; null = não existe
  findEvent(id: string): Promise<Event | null>;
  findCurrentEvent(): Promise<Event | null>; // D2
  findEventByIntegrationId(integrationId: number): Promise<Event | null>; // D7
  findEventByTransicionaisDayId(transicionaisDayId: number): Promise<Event | null>;
  createEvent(event: Event): Promise<Event>;
  updateEvent(event: Event): Promise<Event>;

  findUserByEmail(email: string): Promise<User | null>;
  findUserByIntegrationId(integrationId: string): Promise<User | null>; // D7
  findUserById(id: string, event: Event): Promise<User | null>; // D3, D16
  createOrUpdateUser(user: User): Promise<User>; // D8
  findEventUsers(event: Event): Promise<User[]>; // D5

  // a presença pelo id, no event; null = não existe
  findAttendance(id: string, event: Event): Promise<Attendance | null>;
  // todas as presenças do event, da mais antiga para a mais nova
  findEventAttendance(event: Event): Promise<Attendance[]>;
  findAttendanceByIntegrationId(integrationId: number, event: Event): Promise<Attendance | null>; // D7
  createOrUpdateAttendance(attendance: Attendance, event: Event): Promise<Attendance>; // D8

  findIntegrationStatus(entity: IntegrationEntity, entityId: string): Promise<IntegrationStatus | null>;
  createOrUpdateIntegrationStatus(integrationStatus: IntegrationStatus): Promise<IntegrationStatus>;
}
