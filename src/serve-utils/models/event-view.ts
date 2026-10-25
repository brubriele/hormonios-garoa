import { InvalidParameterError } from "../errors/app-error";
import { EventInstrument } from "./event-instrument";

// o ensaio público (GET /api/ensaio): o retrato com as vagas pelas reservas (D22)
export class EventView {
  constructor(
    readonly dayKey: string,
    readonly date: string, // vazia = a definir
    readonly time: string, // vazia = a definir
    readonly location: string,
    readonly bookingOpen: boolean,
    readonly whatsappUrl: string,
    readonly goingCount: number, // linhas "vou" que não estão REJECTED (D8)
    readonly instruments: EventInstrument[], // só os grupos ativos
    readonly stale: boolean, // true = o Transicionais não respondeu e é o último retrato
    readonly fetchedAt: string | null, // ISO da última leitura do Transicionais
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.dayKey !== "string" || this.dayKey.trim() === "") {
      throw new InvalidParameterError("Field eventView.dayKey is invalid");
    }

    if (typeof this.date !== "string" || typeof this.time !== "string" || typeof this.location !== "string") {
      throw new InvalidParameterError("Field eventView.date, time or location is invalid");
    }

    if (typeof this.bookingOpen !== "boolean" || typeof this.stale !== "boolean") {
      throw new InvalidParameterError("Field eventView.bookingOpen or stale is invalid");
    }

    if (typeof this.whatsappUrl !== "string") {
      throw new InvalidParameterError("Field eventView.whatsappUrl is invalid");
    }

    if (!Number.isInteger(this.goingCount) || this.goingCount < 0) {
      throw new InvalidParameterError("Field eventView.goingCount is invalid");
    }

    if (!Array.isArray(this.instruments) || this.instruments.some((item) => !(item instanceof EventInstrument))) {
      throw new InvalidParameterError("Field eventView.instruments is invalid");
    }

    if (this.fetchedAt !== null && typeof this.fetchedAt !== "string") {
      throw new InvalidParameterError("Field eventView.fetchedAt is invalid");
    }
  }
}
