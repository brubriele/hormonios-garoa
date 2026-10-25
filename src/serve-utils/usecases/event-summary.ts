// Formatos de resposta compartilhados pelos usecases do ensaio e da Produção.
// Funções puras: só montam a resposta a partir do model.
import type { Attendance, AttendanceSync } from "../models/attendance";
import type { CurrentEvent, Group, Support } from "../models/current-event";
import type { UUID } from "../interfaces/uuid";

export interface IAccessoryView {
  id: string; // assistência type='acessorio'
  name: string;
  available: number | null; // null = sem limite
  soldOut: boolean;
}

export interface IInstrumentView {
  id: string; // grupo do Transicionais (o groupId da reserva)
  name: string;
  stockTotal: number | null; // null = sem limite
  available: number | null;
  soldOut: boolean; // !rotativo && available === 0
  accessories: IAccessoryView[];
}

export interface IEventView {
  dayKey: string;
  date: string;
  time: string;
  location: string;
  bookingOpen: boolean;
  whatsappUrl: string;
  goingCount: number;
  instruments: IInstrumentView[];
}

export type StockType = "instrumento" | "acessorio";

export interface IStockReservationView {
  name: string;
  pronoun: string;
  detail: string; // instrumento: os acessórios da pessoa; acessório: o instrumento dela
}

export interface IStockView {
  id: string; // assistência (supportId); o do instrumento é o instrumentSupportId do grupo
  name: string;
  type: StockType;
  stockTotal: number | null; // null = sem limite
  available: number | null;
  rotativo: boolean;
  reservations: IStockReservationView[];
}

export interface IAdminEventView extends Omit<IEventView, "instruments"> {
  stock: IStockView[];
}

export interface IAdminAttendanceView {
  id: UUID;
  name: string;
  pronoun: string;
  groupId: string | null;
  supportIds: string[];
  createdAt: string;
  sync: AttendanceSync;
}

export interface IAdminSummary {
  event: IAdminEventView;
  attendances: IAdminAttendanceView[];
}

const NO_ACCESSORIES = "Sem acessórios";

// vagas ocupadas por grupo:
//   retrato do Transicionais: o ocupado lá (taken) + as linhas "vou" locais PENDING do grupo;
//   retrato local da fase 1: as linhas "vou" do grupo (REJECTED não conta)
export function countTakenByGroup(event: CurrentEvent, attendances: Attendance[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const group of event.groups) {
    counts.set(group.id, group.taken ?? 0);
  }

  for (const attendance of attendances) {
    if (!attendance.isGoing || attendance.groupId === null) {
      continue;
    }

    const group = event.findGroup(attendance.groupId);

    if (group && group.taken !== null && !attendance.isPending) {
      continue; // já está no taken do Transicionais
    }

    counts.set(attendance.groupId, (counts.get(attendance.groupId) ?? 0) + 1);
  }

  return counts;
}

// acessórios ocupados, com a mesma regra do grupo: taken + linhas "vou" locais PENDING com o
// acessório; no retrato local da fase 1 (taken null), as linhas "vou" com o acessório
export function countTakenBySupport(event: CurrentEvent, attendances: Attendance[]): Map<string, number> {
  const counts = new Map<string, number>();
  const byId = new Map(event.supports.map((support) => [support.id, support]));

  for (const support of event.supports) {
    counts.set(support.id, support.taken ?? 0);
  }

  for (const attendance of attendances) {
    if (!attendance.isGoing) {
      continue;
    }

    for (const supportId of new Set(attendance.supportIds)) {
      const support = byId.get(supportId);

      if (support && support.taken !== null && !attendance.isPending) {
        continue; // já está no taken do Transicionais
      }

      counts.set(supportId, (counts.get(supportId) ?? 0) + 1);
    }
  }

  return counts;
}

function toAvailable(stockTotal: number | null, taken: number): number | null {
  return stockTotal === null ? null : Math.max(0, stockTotal - taken);
}

function isSoldOut(rotativo: boolean, available: number | null): boolean {
  return !rotativo && available === 0;
}

function toAccessoryView(support: Support, taken: Map<string, number>): IAccessoryView {
  const available = toAvailable(support.stockTotal, taken.get(support.id) ?? 0);

  return { id: support.id, name: support.name, available, soldOut: isSoldOut(support.rotativo, available) };
}

function toInstrumentView(
  event: CurrentEvent,
  group: Group,
  takenByGroup: Map<string, number>,
  takenBySupport: Map<string, number>,
): IInstrumentView {
  const available = toAvailable(group.stockTotal, takenByGroup.get(group.id) ?? 0);

  return {
    id: group.id,
    name: group.name,
    stockTotal: group.stockTotal,
    available,
    soldOut: isSoldOut(group.rotativo, available),
    accessories: event.supportsForGroup(group.id).map((support) => toAccessoryView(support, takenBySupport)),
  };
}

function toBaseEventView(event: CurrentEvent, attendances: Attendance[]): Omit<IEventView, "instruments"> {
  return {
    dayKey: event.dayKey,
    date: event.date,
    time: event.time,
    location: event.location,
    bookingOpen: event.bookingOpen,
    whatsappUrl: event.whatsappUrl,
    goingCount: attendances.filter((attendance) => attendance.isGoing).length,
  };
}

// só grupos ativos, cada um com os acessórios que valem para ele (GET /api/ensaio)
export function toEventView(event: CurrentEvent, attendances: Attendance[]): IEventView {
  const takenByGroup = countTakenByGroup(event, attendances);
  const takenBySupport = countTakenBySupport(event, attendances);

  return {
    ...toBaseEventView(event, attendances),
    instruments: event.groups
      .filter((group) => group.active)
      .map((group) => toInstrumentView(event, group, takenByGroup, takenBySupport)),
  };
}

function toAccessoryNames(event: CurrentEvent, attendance: Attendance): string {
  const names = [...new Set(attendance.supportIds)]
    .map((supportId) => event.supports.find((support) => support.id === supportId)?.name)
    .filter((name): name is string => name !== undefined);

  return names.length > 0 ? names.join(" · ") : NO_ACCESSORIES;
}

function toReservationView(attendance: Attendance, detail: string): IStockReservationView {
  return { name: attendance.user.name, pronoun: attendance.user.pronoun, detail };
}

// instrumento: a assistência do grupo; grupo sem instrumentSupportId fica de fora
function toInstrumentStock(
  event: CurrentEvent,
  going: Attendance[],
  takenByGroup: Map<string, number>,
): IStockView[] {
  return event.groups.flatMap((group) => {
    if (group.instrumentSupportId === null) {
      return [];
    }

    return [
      {
        id: group.instrumentSupportId,
        name: group.name,
        type: "instrumento" as const,
        stockTotal: group.stockTotal,
        available: toAvailable(group.stockTotal, takenByGroup.get(group.id) ?? 0),
        rotativo: group.rotativo,
        reservations: going
          .filter((attendance) => attendance.groupId === group.id)
          .map((attendance) => toReservationView(attendance, toAccessoryNames(event, attendance))),
      },
    ];
  });
}

function toAccessoryStock(event: CurrentEvent, going: Attendance[], takenBySupport: Map<string, number>): IStockView[] {
  return event.supports.map((support) => ({
    id: support.id,
    name: support.name,
    type: "acessorio" as const,
    stockTotal: support.stockTotal,
    available: toAvailable(support.stockTotal, takenBySupport.get(support.id) ?? 0),
    rotativo: support.rotativo,
    reservations: going
      .filter((attendance) => attendance.supportIds.includes(support.id))
      .map((attendance) =>
        toReservationView(attendance, attendance.groupId === null ? "" : event.findGroup(attendance.groupId)?.name ?? ""),
      ),
  }));
}

// estoque da Produção: instrumentos primeiro, depois acessórios, na ordem do Transicionais
export function toAdminSummary(event: CurrentEvent, attendances: Attendance[]): IAdminSummary {
  const going = attendances.filter((attendance) => attendance.isGoing);
  const takenByGroup = countTakenByGroup(event, attendances);
  const takenBySupport = countTakenBySupport(event, attendances);

  return {
    event: {
      ...toBaseEventView(event, attendances),
      stock: [
        ...toInstrumentStock(event, going, takenByGroup),
        ...toAccessoryStock(event, going, takenBySupport),
      ],
    },
    attendances: going.map((attendance) => ({
      id: attendance.id,
      name: attendance.user.name,
      pronoun: attendance.user.pronoun,
      groupId: attendance.groupId,
      supportIds: attendance.supportIds,
      createdAt: attendance.createdAt,
      sync: attendance.sync,
    })),
  };
}
