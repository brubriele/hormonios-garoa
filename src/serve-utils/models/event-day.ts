import { InvalidParameterError } from "../errors/app-error";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isOptionalText(value: string | null): boolean {
  return value === null || typeof value === "string";
}

function isOptionalInteger(value: number | null): boolean {
  return value === null || Number.isInteger(value);
}

// dia de um encontro no Transicionais (D7). Os campos do calendário (kind, weekOfYear...) só voltam
// como vieram no salvamento dos dias; null = não veio
export class EventDay {
  constructor(
    readonly id: string | null, // null = dia ainda não salvo ("disponível")
    readonly date: string, // YYYY-MM-DD
    readonly active: boolean,
    readonly startTime: string | null, // HH:mm; null = a definir
    readonly endTime: string | null, // HH:mm; null = a definir
    readonly eventId: string | null,
    readonly kind: string | null,
    readonly weekOfYear: number | null,
    readonly dayOfWeek: number | null,
    readonly utcDayOfWeek: number | null,
    readonly inMemory: boolean | null,
  ) {
    this.validate();
  }

  // ativo, com o horário (o model é imutável)
  activate(startTime: string | null, endTime: string | null): EventDay {
    return this.copy(true, startTime, endTime);
  }

  // desativado: as presenças ficam nele (D7)
  deactivate(): EventDay {
    return this.copy(false, this.startTime, this.endTime);
  }

  withStartTime(startTime: string | null): EventDay {
    return this.copy(this.active, startTime, this.endTime);
  }

  private copy(active: boolean, startTime: string | null, endTime: string | null): EventDay {
    return new EventDay(
      this.id,
      this.date,
      active,
      startTime,
      endTime,
      this.eventId,
      this.kind,
      this.weekOfYear,
      this.dayOfWeek,
      this.utcDayOfWeek,
      this.inMemory,
    );
  }

  private validate() {
    if (this.id !== null && (typeof this.id !== "string" || this.id.trim() === "")) {
      throw new InvalidParameterError("Field day.id is invalid");
    }

    if (typeof this.date !== "string" || !DATE_PATTERN.test(this.date)) {
      throw new InvalidParameterError("Field day.date is invalid");
    }

    if (typeof this.active !== "boolean") {
      throw new InvalidParameterError("Field day.active is invalid");
    }

    if (!isOptionalText(this.startTime) || !isOptionalText(this.endTime)) {
      throw new InvalidParameterError("Field day.time is invalid");
    }

    if (!isOptionalText(this.eventId) || !isOptionalText(this.kind)) {
      throw new InvalidParameterError("Field day.eventId is invalid");
    }

    if (!isOptionalInteger(this.weekOfYear) || !isOptionalInteger(this.dayOfWeek) || !isOptionalInteger(this.utcDayOfWeek)) {
      throw new InvalidParameterError("Field day.weekOfYear is invalid");
    }

    if (this.inMemory !== null && typeof this.inMemory !== "boolean") {
      throw new InvalidParameterError("Field day.inMemory is invalid");
    }
  }
}
