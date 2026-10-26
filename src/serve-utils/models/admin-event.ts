import { z } from "zod";
import { StockItem } from "./stock-item";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const AdminEventSchema = z.object({
  dayKey: NonBlankSchema,
  date: z.string(),
  time: z.string(),
  location: z.string(),
  bookingOpen: z.boolean(),
  whatsappUrl: z.string(),
  goingCount: CountSchema,
  stock: z.array(z.instanceof(StockItem)),
});

// o ensaio no resumo da Produção: o retrato com o estoque (instrumentos e depois acessórios)
export class AdminEvent {
  constructor(
    readonly dayKey: string,
    readonly date: string, // vazia = a definir
    readonly time: string, // vazia = a definir
    readonly location: string,
    readonly bookingOpen: boolean,
    readonly whatsappUrl: string,
    readonly goingCount: number, // linhas "vou" que não estão REJECTED (D8)
    readonly stock: StockItem[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(AdminEventSchema, this, "adminEvent");
  }
}
