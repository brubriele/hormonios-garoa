import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { CountSchema, NonBlankSchema, UuidSchema, validateSchema } from "./model-schema";
import { PendingWrite, PendingWriteKind } from "./pending-write";

const PendingSupportCapacitySchema = z.object({
  id: UuidSchema,
  supportId: NonBlankSchema,
  capacity: CountSchema,
  updatedAt: NonBlankSchema,
});

// estoque de uma assistência que ainda não foi ao Transicionais (D53): o retrato já mostra o valor
export class PendingSupportCapacity extends PendingWrite {
  readonly kind = PendingWriteKind.SupportCapacity;

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
    validateSchema(PendingSupportCapacitySchema, this, "pendingSupportCapacity");
  }
}
