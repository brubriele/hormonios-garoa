import { z } from "zod";
import { ErrorKey } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";
import { User } from "./user";
import { NonBlankSchema, validateSchema } from "./model-schema";

export enum BookingAnswer {
  Going = "vou",
  NotGoing = "nao-vou",
}

// status do envio ao Transicionais (R5)
export enum BookingSync {
  Pending = "PENDING",
  Synced = "SYNCED",
  Rejected = "REJECTED",
  ManualRetry = "MANUAL_RETRY", // o Transicionais recusou o contrato: o cron não envia, ajuste manual (D50)
}

// como gravar o resultado de um envio ao Transicionais (função marcar_sync)
export enum SyncMode {
  Synced = "SYNCED",
  Rejected = "REJECTED",
  ManualRetry = "MANUAL_RETRY", // 400, 409 ou 422: sai do cron até o ajuste manual (D50)
  Retry = "RETRY", // fica PENDING para o próximo ciclo
  Backoff = "BACKOFF", // fica PENDING, attempts + 1, e volta na próxima chamada do cron (D46)
}

// resultado de um validation.changed aplicado à reserva (função aplicar_validacao)
export enum ApplyValidationResult {
  Applied = "APPLIED", // gravou
  Stale = "STALE", // o webhook é mais velho
  LocalNewer = "LOCAL_NEWER", // a mudança local é mais nova
  UnknownPerson = "UNKNOWN_PERSON", // fora de hg_users (B6)
  NoRow = "NO_ROW", // a pessoa não tem linha no dia
}

const BookingSchema = z
  .object({
    user: z.instanceof(User),
    dayKey: NonBlankSchema,
    answer: z.enum(BookingAnswer),
    groupId: NonBlankSchema.nullable(), // null = só presença
    supportIds: z.array(NonBlankSchema),
    createdAt: NonBlankSchema,
    sync: z.enum(BookingSync),
    syncError: z.enum(ErrorKey).nullable(),
    updatedAt: NonBlankSchema.nullable(),
  })
  .refine((booking) => booking.groupId !== null || booking.supportIds.length === 0, {
    path: ["supportIds"],
    message: "must be empty without groupId",
  });

export class Booking {
  constructor(
    readonly id: UUID,
    readonly user: User,
    readonly dayKey: string,
    readonly deviceId: UUID,
    readonly answer: BookingAnswer,
    readonly groupId: string | null, // null = só presença
    readonly supportIds: string[],
    readonly createdAt: string,
    readonly sync: BookingSync = BookingSync.Pending,
    readonly syncError: ErrorKey | null = null, // só quando REJECTED
    // última mudança local (hg_attendances.updated_at, como veio do banco): trava e idempotência do envio
    readonly updatedAt: string | null = null,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(BookingSchema, this);
  }

  // REJECTED não ocupa vaga e não conta como reserva
  get isGoing(): boolean {
    return this.answer === BookingAnswer.Going && this.sync !== BookingSync.Rejected;
  }

  get isPending(): boolean {
    return this.sync === BookingSync.Pending;
  }

  // ainda não está no Transicionais: PENDING ou MANUAL_RETRY (D50). Ocupa vaga além do taken
  get isLocalOnly(): boolean {
    return this.isPending || this.sync === BookingSync.ManualRetry;
  }

  // dia do Transicionais (configDayId, numérico). O de ensaio antigo da fase 1 é um UUID local, que
  // não existe lá (D45)
  get isFromTransicionaisDay(): boolean {
    return /^[0-9]+$/.test(this.dayKey);
  }
}
