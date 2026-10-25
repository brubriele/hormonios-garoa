import { InvalidParameterError } from "../errors/app-error";
import { CurrentEvent } from "./current-event";

// retrato do encontro lido do Transicionais, com o que a trava precisa (R13)
export class EventSnapshot {
  constructor(
    readonly externalId: string,
    readonly version: number,
    readonly vacanciesAt: string, // ISO de quando as vagas foram lidas
    readonly event: CurrentEvent,
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.externalId !== "string" || this.externalId.trim() === "") {
      throw new InvalidParameterError("Field externalId is invalid");
    }

    if (!Number.isInteger(this.version)) {
      throw new InvalidParameterError("Field version is invalid");
    }

    if (typeof this.vacanciesAt !== "string" || Number.isNaN(Date.parse(this.vacanciesAt))) {
      throw new InvalidParameterError("Field vacanciesAt is invalid");
    }

    if (!(this.event instanceof CurrentEvent)) {
      throw new InvalidParameterError("Field event is invalid");
    }
  }
}
