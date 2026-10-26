import { z } from "zod";
import { CurrentEvent } from "./current-event";
import { DateTimeSchema, NonBlankSchema, validateSchema } from "./model-schema";

const EventSnapshotSchema = z.object({
  externalId: NonBlankSchema,
  version: z.number().int(),
  hash: NonBlankSchema.nullable(),
  vacanciesAt: DateTimeSchema,
  event: z.instanceof(CurrentEvent),
});

// retrato do encontro lido do Transicionais, com o que a trava precisa (R13)
export class EventSnapshot {
  constructor(
    readonly externalId: string,
    readonly version: number,
    readonly hash: string | null, // md5 do encontro no Transicionais: muda quando algum campo muda (D48). null = sem hash (webhook)
    readonly vacanciesAt: string, // ISO de quando as vagas foram lidas
    readonly event: CurrentEvent,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(EventSnapshotSchema, this);
  }
}
