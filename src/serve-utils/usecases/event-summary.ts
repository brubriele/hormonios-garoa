// Formatos de resposta compartilhados pelos usecases do ensaio e da Produção.
// Funções puras: só montam a resposta a partir do model.
import type { Attendance } from "../models/attendance";
import type { CurrentEvent, Group } from "../models/current-event";
import type { UUID } from "../interfaces/uuid";

export interface IGroupView {
  id: string;
  name: string;
  stockTotal: number;
  available: number;
}

export interface IAdminGroupView extends IGroupView {
  active: boolean;
}

export interface ISupportView {
  id: string;
  name: string;
}

export interface IEventView {
  dayKey: string;
  date: string;
  time: string;
  location: string;
  bookingOpen: boolean;
  whatsappUrl: string;
  goingCount: number;
  groups: IGroupView[];
  supports: ISupportView[];
}

export interface IAdminEventView extends Omit<IEventView, "groups"> {
  groups: IAdminGroupView[];
}

export interface IAdminAttendanceView {
  id: UUID;
  name: string;
  pronoun: string;
  groupId: string | null;
  supportIds: string[];
  createdAt: string;
}

export interface IAdminSummary {
  event: IAdminEventView;
  attendances: IAdminAttendanceView[];
}

// reservas "vou" por grupo
export function countReservedByGroup(attendances: Attendance[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const attendance of attendances) {
    if (!attendance.isGoing || attendance.groupId === null) {
      continue;
    }

    counts.set(attendance.groupId, (counts.get(attendance.groupId) ?? 0) + 1);
  }

  return counts;
}

function toGroupView(group: Group, reserved: Map<string, number>): IGroupView {
  return {
    id: group.id,
    name: group.name,
    stockTotal: group.stockTotal,
    available: Math.max(0, group.stockTotal - (reserved.get(group.id) ?? 0)),
  };
}

function toBaseEventView(event: CurrentEvent, attendances: Attendance[]): Omit<IEventView, "groups"> {
  return {
    dayKey: event.dayKey,
    date: event.date,
    time: event.time,
    location: event.location,
    bookingOpen: event.bookingOpen,
    whatsappUrl: event.whatsappUrl,
    goingCount: attendances.filter((attendance) => attendance.isGoing).length,
    supports: event.supports.map((support) => ({ id: support.id, name: support.name })),
  };
}

// só grupos ativos (GET /api/ensaio)
export function toEventView(event: CurrentEvent, attendances: Attendance[]): IEventView {
  const reserved = countReservedByGroup(attendances);

  return {
    ...toBaseEventView(event, attendances),
    groups: event.groups.filter((group) => group.active).map((group) => toGroupView(group, reserved)),
  };
}

// todos os grupos, com active (Produção)
export function toAdminSummary(event: CurrentEvent, attendances: Attendance[]): IAdminSummary {
  const reserved = countReservedByGroup(attendances);

  return {
    event: {
      ...toBaseEventView(event, attendances),
      groups: event.groups.map((group) => ({ ...toGroupView(group, reserved), active: group.active })),
    },
    attendances: attendances
      .filter((attendance) => attendance.isGoing)
      .map((attendance) => ({
        id: attendance.id,
        name: attendance.user.name,
        pronoun: attendance.user.pronoun,
        groupId: attendance.groupId,
        supportIds: attendance.supportIds,
        createdAt: attendance.createdAt,
      })),
  };
}
