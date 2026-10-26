import { z } from "zod";
import { SummaryStockItem } from "./summary-stock-item";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const SummaryEventSchema = z.object({
  dayKey: NonBlankSchema,
  date: z.string(),
  time: z.string(),
  location: z.string(),
  bookingOpen: z.boolean(),
  whatsappUrl: z.string(),
  goingCount: CountSchema,
  stock: z.array(z.instanceof(SummaryStockItem)),
});

// o ensaio no resumo da Produção: o retrato com o estoque (instrumentos e depois acessórios)
export class SummaryEvent {
  constructor(
    readonly dayKey: string,
    readonly date: string, // vazia = a definir
    readonly time: string, // vazia = a definir
    readonly location: string,
    readonly bookingOpen: boolean,
    readonly whatsappUrl: string,
    readonly goingCount: number, // linhas "vou" que não estão REJECTED (D8)
    readonly stock: SummaryStockItem[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(SummaryEventSchema, this, "summaryEvent");
  }
}
