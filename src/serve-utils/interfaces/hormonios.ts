import type { Attendance, AttendanceAnswer } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
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

export interface IRawGroup {
  id: string;
  name: string;
  stockTotal: number;
  active: boolean;
}

export interface IRawSupport {
  id: string;
  name: string;
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

export interface IHormoniosRepo {
  findCurrentEvent(): Promise<CurrentEvent | null>;
  findCurrentEventOrFail(): Promise<CurrentEvent>;
  saveCurrentEvent(event: CurrentEvent): Promise<CurrentEvent>;
  upsertUserByEmail(data: IUpsertUserData): Promise<User>;
  reserve(data: IReserveData): Promise<Attendance>;
  cancelByDevice(filter: ICancelByDeviceFilter): Promise<void>;
  listByDevice(filter: IListByDeviceFilter): Promise<Attendance[]>;
  listByDay(dayKey: string): Promise<Attendance[]>;
}
