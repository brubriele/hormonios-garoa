import { z } from "zod";
import { StockBooking } from "./stock-booking";
import { SupportTypeKind } from "./support-type";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const StockItemSchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
  type: z.enum(SupportTypeKind),
  stockTotal: CountSchema.nullable(),
  available: CountSchema.nullable(),
  rotativo: z.boolean(),
  reservations: z.array(z.instanceof(StockBooking)),
});

// um item do estoque no resumo da Produção (E2.9): o instrumento ou o acessório, com as vagas
export class StockItem {
  constructor(
    readonly id: string, // assistência (supportId); o do instrumento é o instrumentSupportId do grupo
    readonly name: string,
    readonly type: SupportTypeKind,
    readonly stockTotal: number | null, // null = sem limite
    readonly available: number | null, // null = sem limite
    readonly rotativo: boolean,
    readonly reservations: StockBooking[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(StockItemSchema, this, "stockItem");
  }
}
