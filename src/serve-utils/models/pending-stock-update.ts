import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { CountSchema, NonBlankSchema, UuidSchema, validateSchema } from "./model-schema";
import { PendingSync, PendingSyncKind } from "./pending-sync";

const PendingStockUpdateSchema = z.object({
  id: UuidSchema,
  supportId: NonBlankSchema,
  capacity: CountSchema,
  updatedAt: NonBlankSchema,
});

// estoque de uma assistência que ainda não foi ao Transicionais (D53): o retrato já mostra o valor
export class PendingStockUpdate extends PendingSync {
  readonly kind = PendingSyncKind.StockUpdate;

  constructor(
    readonly id: UUID,
    readonly supportId: string, // o instrumentSupportId de um grupo ou o id de um acessório
    readonly capacity: number,
    readonly updatedAt: string,
  ) {
    super();
    this.validate();
  }

  private validate() {
    validateSchema(PendingStockUpdateSchema, this, "pendingStockUpdate");
  }
}
