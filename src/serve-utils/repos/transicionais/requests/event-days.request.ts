import type { EventDay } from "../../../models/event-day";
import { numericId } from "../transicionais-id";

// um dia no PUT v2/manager-events/details/{id}/config-day: o dia inteiro, como veio do GET, com o
// ativo e o horário pedidos (D7). Campo do calendário que não veio fica de fora
export interface IEventDayBody {
  id: number | null; // null = dia ainda não salvo (o id nasce no salvamento)
  current: string; // YYYY-MM-DD
  isActive: boolean;
  startTime: string | null;
  endTime: string | null;
  eventId?: number;
  type?: string;
  weekOfYear?: number;
  dayOfWeek?: number;
  utcDayOfWeek?: number;
  inMemory?: boolean;
}

// corpo do PUT dos dias: a version do encontro e os dias que mudam
export interface IEventDaysBody {
  version: number;
  days: IEventDayBody[];
}

export class EventDaysRequest {
  static fromDomain(version: number, days: EventDay[]): IEventDaysBody {
    return { version, days: days.map(EventDaysRequest.toDay) };
  }

  private static toDay(day: EventDay): IEventDayBody {
    const body: IEventDayBody = {
      id: day.id === null ? null : numericId(day.id, "configDayId"),
      current: day.date,
      isActive: day.active,
      startTime: day.startTime,
      endTime: day.endTime,
    };

    if (day.eventId !== null) {
      body.eventId = numericId(day.eventId, "eventId");
    }

    if (day.kind !== null) {
      body.type = day.kind;
    }

    if (day.weekOfYear !== null) {
      body.weekOfYear = day.weekOfYear;
    }

    if (day.dayOfWeek !== null) {
      body.dayOfWeek = day.dayOfWeek;
    }

    if (day.utcDayOfWeek !== null) {
      body.utcDayOfWeek = day.utcDayOfWeek;
    }

    if (day.inMemory !== null) {
      body.inMemory = day.inMemory;
    }

    return body;
  }
}
