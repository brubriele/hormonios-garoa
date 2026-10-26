import { z } from "zod";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

// tipo da assistência: o instrumento emprestado ou um acessório dele (E2.9)
export enum SupportTypeKind {
  Instrument = "instrumento",
  Accessory = "acessorio",
}

const SupportTypeSchema = z.object({
  id: NonBlankSchema,
  title: NonBlankSchema,
  description: z.string().nullable(),
  active: z.boolean(),
  capacity: CountSchema.nullable(),
  groupIds: z.array(NonBlankSchema),
  rotativo: z.boolean(),
  requiredForActivity: z.boolean(),
  kind: z.enum(SupportTypeKind).nullable(),
});

// o catálogo de uma assistência no Transicionais (D26): salvo sempre inteiro, porque sem groupIds ela
// passaria a valer para a organização inteira
export class SupportType {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly description: string | null,
    readonly active: boolean,
    readonly capacity: number | null, // o estoque; null = sem limite
    readonly groupIds: string[], // vazio = vale para todos os grupos
    readonly rotativo: boolean, // a capacidade conta, mas não bloqueia
    readonly requiredForActivity: boolean,
    readonly kind: SupportTypeKind | null, // null = não veio (D23)
  ) {
    this.validate();
  }

  // a mesma assistência com outro estoque (o model é imutável)
  withCapacity(capacity: number): SupportType {
    return new SupportType(
      this.id,
      this.title,
      this.description,
      this.active,
      capacity,
      this.groupIds,
      this.rotativo,
      this.requiredForActivity,
      this.kind,
    );
  }

  private validate() {
    validateSchema(SupportTypeSchema, this, "supportType");
  }
}
