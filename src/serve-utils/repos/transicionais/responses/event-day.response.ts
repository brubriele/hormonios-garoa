import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { EventDay } from "../../../models/event-day";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

// dia de GET v2/manager-events/details/{id}/config-day e de configDays no completo do encontro. Os
// campos do calendário só voltam como vieram no PUT dos dias (D7)
export const EventDaySchema = z.object({
  id: TransicionaisIdSchema.nullable(), // null = dia ainda não salvo ("disponível")
  current: z.string().transform((date) => date.slice(0, 10)), // YYYY-MM-DD
  isActive: z.boolean(),
  startTime: z.string().nullable(), // HH:mm; null = a definir
  endTime: z.string().nullable(),
  eventId: TransicionaisIdSchema.optional().transform((value) => value ?? null), // null = não veio
  type: z.string().optional().transform((value) => value ?? null), // null = não veio
  weekOfYear: z.number().int().optional().transform((value) => value ?? null), // null = não veio
  dayOfWeek: z.number().int().optional().transform((value) => value ?? null), // null = não veio
  utcDayOfWeek: z.number().int().optional().transform((value) => value ?? null), // null = não veio
  inMemory: z.boolean().optional().transform((value) => value ?? null), // null = não veio
});

const EventDaysSchema = z.array(EventDaySchema);

export type ITransicionaisDay = z.infer<typeof EventDaySchema>;

export class EventDayResponse {
  static toDomain(raw: unknown, operation: string): EventDay[] {
    const days = parseResponse(EventDaysSchema, raw, InfraSource.Transicionais, operation);

    return InvalidResponseError.guard(InfraSource.Transicionais, operation, () => days.map(EventDayResponse.fromRaw));
  }

  // dia já validado (ex.: os configDays do completo do encontro)
  static fromRaw(day: ITransicionaisDay): EventDay {
    return new EventDay(
      day.id,
      day.current,
      day.isActive,
      day.startTime,
      day.endTime,
      day.eventId,
      day.type,
      day.weekOfYear,
      day.dayOfWeek,
      day.utcDayOfWeek,
      day.inMemory,
    );
  }
}
