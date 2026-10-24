import { InvalidParameterError } from "../errors/app-error";

export class Group {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly stockTotal: number,
    readonly active: boolean,
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field group.id is invalid");
    }

    if (typeof this.name !== "string" || this.name.trim() === "") {
      throw new InvalidParameterError("Field group.name is invalid");
    }

    if (!Number.isInteger(this.stockTotal) || this.stockTotal < 0) {
      throw new InvalidParameterError("Field group.stockTotal is invalid");
    }

    if (typeof this.active !== "boolean") {
      throw new InvalidParameterError("Field group.active is invalid");
    }
  }
}

export class Support {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field support.id is invalid");
    }

    if (typeof this.name !== "string" || this.name.trim() === "") {
      throw new InvalidParameterError("Field support.name is invalid");
    }
  }
}

export class CurrentEvent {
  constructor(
    readonly dayKey: string, // fase 1: UUID local; fase 2: String(configDayId)
    readonly date: string, // vazia = a definir
    readonly time: string, // vazia = a definir
    readonly location: string,
    readonly bookingOpen: boolean,
    readonly whatsappUrl: string,
    readonly groups: Group[],
    readonly supports: Support[],
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.dayKey !== "string" || this.dayKey.trim() === "") {
      throw new InvalidParameterError("Field dayKey is invalid");
    }

    if (typeof this.date !== "string") {
      throw new InvalidParameterError("Field date is invalid");
    }

    if (typeof this.time !== "string") {
      throw new InvalidParameterError("Field time is invalid");
    }

    if (typeof this.location !== "string") {
      throw new InvalidParameterError("Field location is invalid");
    }

    if (typeof this.bookingOpen !== "boolean") {
      throw new InvalidParameterError("Field bookingOpen is invalid");
    }

    if (typeof this.whatsappUrl !== "string") {
      throw new InvalidParameterError("Field whatsappUrl is invalid");
    }

    if (!Array.isArray(this.groups) || this.groups.some((group) => !(group instanceof Group))) {
      throw new InvalidParameterError("Field groups is invalid");
    }

    if (!Array.isArray(this.supports) || this.supports.some((support) => !(support instanceof Support))) {
      throw new InvalidParameterError("Field supports is invalid");
    }
  }

  findGroup(id: string): Group | null {
    return this.groups.find((group) => group.id === id) ?? null;
  }
}
