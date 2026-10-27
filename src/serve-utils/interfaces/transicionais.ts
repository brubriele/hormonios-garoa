import type { Attendance } from "../domain/Attendance";
import type { Event } from "../domain/Event";
import type { User } from "../domain/User";

export interface ITransicionaisRepo {
  createEvent(event: Event): Promise<Event>;
  // updateEvent(event: Event): Promise<Event>;
  findEvent(externalId: string): Promise<Event> // já resolve pela listagem e devolve o evento externo, caso receba o externalId pula essa etapa

  createAttendance(user: User): Promise<Attendance>;
  // updateAttendance(user: User): Promise<Attendance>;
  // findUserAttendance(user: User): Promise<Attendance>

  createUser(user: User): Promise<User>;
  findUser(externalId: string): Promise<User>;
  findAttendance(externalId: string): Promise<User>;
  // updateUser(user: User): Promise<User>;
}

export interface ITransicionaisErrorCause {
  operation: string;
  status: number;
  body: unknown;
}

export type IEventRef = any;
export type IAddGroupsData = any;
export type IEventChanges = any;
export type IManagedEventItem = any;
export type INewEventData = any;
export type ISendBookingData = any;
export type ISendBookingPerson = any;
export type ITransicionaisAccount = any;
export type ITransicionaisPresence = any;
