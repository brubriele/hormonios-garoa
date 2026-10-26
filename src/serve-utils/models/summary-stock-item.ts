import { z } from "zod";
import { SummaryStockBooking } from "./summary-stock-booking";
import { LoanCatalogKind } from "./loan-catalog";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const SummaryStockItemSchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
  type: z.enum(LoanCatalogKind),
  stockTotal: CountSchema.nullable(),
  available: CountSchema.nullable(),
  rotativo: z.boolean(),
  reservations: z.array(z.instanceof(SummaryStockBooking)),
});

// um item do estoque no resumo da Produção (E2.9): o instrumento ou o acessório, com as vagas
export class SummaryStockItem {
  constructor(
    readonly id: string, // assistência (supportId); o do instrumento é o instrumentSupportId do grupo
    readonly name: string,
    readonly type: LoanCatalogKind,
    readonly stockTotal: number | null, // null = sem limite
    readonly available: number | null, // null = sem limite
    readonly rotativo: boolean,
    readonly reservations: SummaryStockBooking[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(SummaryStockItemSchema, this, "summaryStockItem");
  }
}
