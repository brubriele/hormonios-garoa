import { ErrorKey, InvalidParameterError } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";
import { User } from "./user";

export enum AttendanceAnswer {
  Going = "vou",
  NotGoing = "nao-vou",
}

// status do envio ao Transicionais (R5)
export enum AttendanceSync {
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

const ANSWERS = Object.values(AttendanceAnswer);
const SYNCS = Object.values(AttendanceSync);
const ERROR_KEYS = Object.values(ErrorKey);

export class Attendance {
  constructor(
    readonly id: UUID,
    readonly user: User,
    readonly dayKey: string,
    readonly deviceId: UUID,
    readonly answer: AttendanceAnswer,
    readonly groupId: string | null, // null = só presença
    readonly supportIds: string[],
    readonly createdAt: string,
    readonly sync: AttendanceSync = AttendanceSync.Pending,
    readonly syncError: ErrorKey | null = null, // só quando REJECTED
    // última mudança local (hg_attendances.updated_at, como veio do banco): trava e idempotência do envio
    readonly updatedAt: string | null = null,
  ) {
    this.validate();
  }

  private validate() {
    if (!(this.user instanceof User)) {
      throw new InvalidParameterError("Field user is invalid");
    }

    if (typeof this.dayKey !== "string" || this.dayKey.trim() === "") {
      throw new InvalidParameterError("Field dayKey is invalid");
    }

    if (!ANSWERS.includes(this.answer)) {
      throw new InvalidParameterError("Field answer is invalid");
    }

    if (this.groupId !== null && (typeof this.groupId !== "string" || this.groupId.trim() === "")) {
      throw new InvalidParameterError("Field groupId is invalid");
    }

    if (!Array.isArray(this.supportIds) || this.supportIds.some((id) => typeof id !== "string" || id.trim() === "")) {
      throw new InvalidParameterError("Field supportIds is invalid");
    }

    if (this.groupId === null && this.supportIds.length > 0) {
      throw new InvalidParameterError("Field supportIds must be empty without groupId");
    }

    if (typeof this.createdAt !== "string" || this.createdAt.trim() === "") {
      throw new InvalidParameterError("Field createdAt is invalid");
    }

    if (!SYNCS.includes(this.sync)) {
      throw new InvalidParameterError("Field sync is invalid");
    }

    if (this.syncError !== null && !ERROR_KEYS.includes(this.syncError)) {
      throw new InvalidParameterError("Field syncError is invalid");
    }

    if (this.updatedAt !== null && (typeof this.updatedAt !== "string" || this.updatedAt.trim() === "")) {
      throw new InvalidParameterError("Field updatedAt is invalid");
    }
  }

  // REJECTED não ocupa vaga e não conta como reserva
  get isGoing(): boolean {
    return this.answer === AttendanceAnswer.Going && this.sync !== AttendanceSync.Rejected;
  }

  get isPending(): boolean {
    return this.sync === AttendanceSync.Pending;
  }

  // ainda não está no Transicionais: PENDING ou MANUAL_RETRY (D50). Ocupa vaga além do taken
  get isLocalOnly(): boolean {
    return this.isPending || this.sync === AttendanceSync.ManualRetry;
  }

  // dia do Transicionais (configDayId, numérico). O de ensaio antigo da fase 1 é um UUID local, que
  // não existe lá (D45)
  get isFromTransicionaisDay(): boolean {
    return /^[0-9]+$/.test(this.dayKey);
  }
}
