import { z } from "zod";
import { PublicInstrument } from "./public-instrument";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const PublicEventSchema = z.object({
  dayKey: NonBlankSchema,
  date: z.string(),
  time: z.string(),
  location: z.string(),
  bookingOpen: z.boolean(),
  whatsappUrl: z.string(),
  goingCount: CountSchema,
  instruments: z.array(z.instanceof(PublicInstrument)),
  stale: z.boolean(),
  fetchedAt: z.string().nullable(),
});

// o ensaio público (GET /api/ensaio): o retrato com as vagas pelas reservas (D22)
export class PublicEvent {
  constructor(
    readonly dayKey: string,
    readonly date: string, // vazia = a definir
    readonly time: string, // vazia = a definir
    readonly location: string,
    readonly bookingOpen: boolean,
    readonly whatsappUrl: string,
    readonly goingCount: number, // linhas "vou" que não estão REJECTED (D8)
    readonly instruments: PublicInstrument[], // só os grupos ativos
    readonly stale: boolean, // true = o Transicionais não respondeu e é o último retrato
    readonly fetchedAt: string | null, // ISO da última leitura do Transicionais
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(PublicEventSchema, this, "publicEvent");
  }
}
