import { InvalidParameterError } from "../errors/app-error";
import { EventAccessory } from "./event-accessory";

// instrumento do ensaio público (GET /api/ensaio), com as vagas e os acessórios que valem para ele
export class EventInstrument {
  constructor(
    readonly id: string, // grupo do Transicionais (o groupId da reserva)
    readonly name: string,
    readonly stockTotal: number | null, // null = sem limite
    readonly available: number | null, // null = sem limite
    readonly soldOut: boolean, // !rotativo && available === 0
    readonly accessories: EventAccessory[],
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field eventInstrument.id is invalid");
    }

    if (typeof this.name !== "string") {
      throw new InvalidParameterError("Field eventInstrument.name is invalid");
    }

    if (this.stockTotal !== null && (!Number.isInteger(this.stockTotal) || this.stockTotal < 0)) {
      throw new InvalidParameterError("Field eventInstrument.stockTotal is invalid");
    }

    if (this.available !== null && (!Number.isInteger(this.available) || this.available < 0)) {
      throw new InvalidParameterError("Field eventInstrument.available is invalid");
    }

    if (typeof this.soldOut !== "boolean") {
      throw new InvalidParameterError("Field eventInstrument.soldOut is invalid");
    }

    if (!Array.isArray(this.accessories) || this.accessories.some((item) => !(item instanceof EventAccessory))) {
      throw new InvalidParameterError("Field eventInstrument.accessories is invalid");
    }
  }
}
