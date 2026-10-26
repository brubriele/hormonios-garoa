import { z } from "zod";
import { validateSchema } from "./model-schema";

const SummaryStockBookingSchema = z.object({
  name: z.string(),
  pronoun: z.string(),
  detail: z.string(),
});

// quem reservou um item do estoque, no resumo da Produção (D30, D31)
export class SummaryStockBooking {
  constructor(
    readonly name: string,
    readonly pronoun: string,
    readonly detail: string, // instrumento: os acessórios da pessoa; acessório: o instrumento dela
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(SummaryStockBookingSchema, this, "summaryStockBooking");
  }
}
