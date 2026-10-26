import { z } from "zod";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const PublicAccessorySchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
  available: CountSchema.nullable(),
  soldOut: z.boolean(),
});

// acessório de um instrumento no ensaio público (GET /api/ensaio), com as vagas
export class PublicAccessory {
  constructor(
    readonly id: string, // assistência type='acessorio'
    readonly name: string,
    readonly available: number | null, // null = sem limite
    readonly soldOut: boolean,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(PublicAccessorySchema, this, "publicAccessory");
  }
}
