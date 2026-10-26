import { z } from "zod";
import { PublicAccessory } from "./public-accessory";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const PublicInstrumentSchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
  stockTotal: CountSchema.nullable(),
  available: CountSchema.nullable(),
  soldOut: z.boolean(),
  accessories: z.array(z.instanceof(PublicAccessory)),
});

// instrumento do ensaio público (GET /api/ensaio), com as vagas e os acessórios que valem para ele
export class PublicInstrument {
  constructor(
    readonly id: string, // grupo do Transicionais (o groupId da reserva)
    readonly name: string,
    readonly stockTotal: number | null, // null = sem limite
    readonly available: number | null, // null = sem limite
    readonly soldOut: boolean, // !rotativo && available === 0
    readonly accessories: PublicAccessory[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(PublicInstrumentSchema, this, "publicInstrument");
  }
}
