import { z } from "zod";
import { GroupCapacity } from "./group-capacity";
import { CountSchema, DateTimeSchema, NonBlankSchema, validateSchema } from "./model-schema";

// visibilidade da publicação do encontro no Transicionais (Interno = sem publicação)
export enum EventVisibility {
  Public = "PUBLIC",
  Private = "PRIVATE",
}

const PublicationSettingsSchema = z.object({
  id: NonBlankSchema,
  visibility: z.enum(EventVisibility),
  description: z.string().nullable(),
  releaseAt: DateTimeSchema.nullable(),
  membersEarlyAt: DateTimeSchema.nullable(),
  guestDeadlineMinutes: CountSchema.nullable(),
  supportIds: z.array(NonBlankSchema),
  totalVacancies: CountSchema.nullable(),
  groupVacancies: z.array(z.instanceof(GroupCapacity)),
});

// a publicação (o `public`) de um encontro: link, abertura das reservas (D1), assistências e vagas
export class PublicationSettings {
  constructor(
    readonly id: string, // o id do link público (= externalId, D6)
    readonly visibility: EventVisibility,
    readonly description: string | null,
    readonly releaseAt: string | null,
    readonly membersEarlyAt: string | null,
    readonly guestDeadlineMinutes: number | null, // prazo do convidado: abre/fecha as reservas (D1)
    readonly supportIds: string[], // todas as assistências oferecidas (instrumentos e acessórios)
    readonly totalVacancies: number | null, // null = sem limite
    readonly groupVacancies: GroupCapacity[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(PublicationSettingsSchema, this, "publicationSettings");
  }
}
