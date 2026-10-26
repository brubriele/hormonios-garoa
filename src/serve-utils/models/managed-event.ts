import { z } from "zod";
import { EventDay } from "./event-day";
import { EventPublication } from "./event-publication";
import { DateOnlySchema, DateTimeSchema, NonBlankSchema, validateSchema } from "./model-schema";

const ManagedEventSchema = z.object({
  id: NonBlankSchema,
  name: NonBlankSchema,
  startDate: DateOnlySchema,
  endDate: DateOnlySchema,
  categoryId: NonBlankSchema.nullable(),
  createdAt: DateTimeSchema,
  version: z.number().int(),
  groupIds: z.array(NonBlankSchema),
  days: z.array(z.instanceof(EventDay)),
  publication: z.instanceof(EventPublication).nullable(),
});

// o encontro como a Produção o edita no Transicionais (a visão de manager): o id interno, a version das
// escritas, o intervalo, o ciclo, os grupos, os dias e a publicação
export class ManagedEvent {
  constructor(
    readonly id: string, // id interno do Transicionais (não é o externalId)
    readonly name: string,
    readonly startDate: string, // YYYY-MM-DD
    readonly endDate: string, // YYYY-MM-DD
    readonly categoryId: string | null, // o ciclo
    readonly createdAt: string,
    readonly version: number,
    readonly groupIds: string[],
    readonly days: EventDay[],
    readonly publication: EventPublication | null, // null = Interno
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(ManagedEventSchema, this, "event");
  }
}
