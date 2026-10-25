import { InvalidParameterError } from "../errors/app-error";

// acessório de um instrumento no ensaio público (GET /api/ensaio), com as vagas
export class EventAccessory {
  constructor(
    readonly id: string, // assistência type='acessorio'
    readonly name: string,
    readonly available: number | null, // null = sem limite
    readonly soldOut: boolean,
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field eventAccessory.id is invalid");
    }

    if (typeof this.name !== "string") {
      throw new InvalidParameterError("Field eventAccessory.name is invalid");
    }

    if (this.available !== null && (!Number.isInteger(this.available) || this.available < 0)) {
      throw new InvalidParameterError("Field eventAccessory.available is invalid");
    }

    if (typeof this.soldOut !== "boolean") {
      throw new InvalidParameterError("Field eventAccessory.soldOut is invalid");
    }
  }
}
