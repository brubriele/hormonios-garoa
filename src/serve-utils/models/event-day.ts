import { z } from "zod";
import { DateOnlySchema, NonBlankSchema, validateSchema } from "./model-schema";

const EventDaySchema = z.object({
  id: NonBlankSchema.nullable(),
  date: DateOnlySchema,
  active: z.boolean(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  eventId: z.string().nullable(),
  kind: z.string().nullable(),
  weekOfYear: z.number().int().nullable(),
  dayOfWeek: z.number().int().nullable(),
  utcDayOfWeek: z.number().int().nullable(),
  inMemory: z.boolean().nullable(),
});

// dia de um encontro no Transicionais (D7). Os campos do calendário (kind, weekOfYear...) só voltam
// como vieram no salvamento dos dias; null = não veio
export class EventDay {
  constructor(
    readonly id: string | null, // null = dia ainda não salvo ("disponível")
    readonly date: string, // YYYY-MM-DD
    readonly active: boolean,
    readonly startTime: string | null, // HH:mm; null = a definir
    readonly endTime: string | null, // HH:mm; null = a definir
    readonly eventId: string | null,
    readonly kind: string | null,
    readonly weekOfYear: number | null,
    readonly dayOfWeek: number | null,
    readonly utcDayOfWeek: number | null,
    readonly inMemory: boolean | null,
  ) {
    this.validate();
  }

  // ativo, com o horário (o model é imutável)
  activate(startTime: string | null, endTime: string | null): EventDay {
    return this.copy(true, startTime, endTime);
  }

  // desativado: as presenças ficam nele (D7)
  deactivate(): EventDay {
    return this.copy(false, this.startTime, this.endTime);
  }

  withStartTime(startTime: string | null): EventDay {
    return this.copy(this.active, startTime, this.endTime);
  }

  private copy(active: boolean, startTime: string | null, endTime: string | null): EventDay {
    return new EventDay(
      this.id,
      this.date,
      active,
      startTime,
      endTime,
      this.eventId,
      this.kind,
      this.weekOfYear,
      this.dayOfWeek,
      this.utcDayOfWeek,
      this.inMemory,
    );
  }

  private validate() {
    validateSchema(EventDaySchema, this, "day");
  }
}
