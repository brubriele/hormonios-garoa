import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { DateOnlySchema, NonBlankSchema, UuidSchema, validateSchema } from "./model-schema";
import { PendingWrite, PendingWriteKind } from "./pending-write";

const PendingNextEventSchema = z.object({
  id: UuidSchema,
  fromExternalId: NonBlankSchema,
  fromDayKey: NonBlankSchema,
  fromDate: DateOnlySchema,
  date: DateOnlySchema,
  dayKey: NonBlankSchema,
  updatedAt: NonBlankSchema,
});

// "Encerrar ensaio" com o Transicionais fora (D51): o próximo existe só no local, no dia dayKey. O
// cron o cria no Transicionais copiando o encontro de origem
export class PendingNextEvent extends PendingWrite {
  readonly kind = PendingWriteKind.NextEvent;

  constructor(
    readonly id: UUID,
    readonly fromExternalId: string, // o encontro encerrado (o link público)
    readonly fromDayKey: string, // o dia dele (o horário do próximo vem dele)
    readonly fromDate: string, // YYYY-MM-DD: acha o encontro na listagem, mesmo depois do dia passar
    readonly date: string, // YYYY-MM-DD do próximo
    readonly dayKey: string, // o dia local do próximo: as linhas dele vão ao dia do Transicionais
    readonly updatedAt: string,
  ) {
    super();
    this.validate();
  }

  private validate() {
    validateSchema(PendingNextEventSchema, this, "pendingNextEvent");
  }
}
