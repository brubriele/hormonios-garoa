import { InvalidParameterError } from "../errors/app-error";

// tipo da assistência: o instrumento emprestado ou um acessório dele (E2.9)
export enum SupportTypeKind {
  Instrument = "instrumento",
  Accessory = "acessorio",
}

// o catálogo de uma assistência no Transicionais (D26): salvo sempre inteiro, porque sem groupIds ela
// passaria a valer para a organização inteira
export class SupportType {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly description: string | null,
    readonly active: boolean,
    readonly capacity: number | null, // o estoque; null = sem limite
    readonly groupIds: string[], // vazio = vale para todos os grupos
    readonly rotativo: boolean, // a capacidade conta, mas não bloqueia
    readonly requiredForActivity: boolean,
    readonly kind: SupportTypeKind | null, // null = não veio (D23)
  ) {
    this.validate();
  }

  // a mesma assistência com outro estoque (o model é imutável)
  withCapacity(capacity: number): SupportType {
    return new SupportType(
      this.id,
      this.title,
      this.description,
      this.active,
      capacity,
      this.groupIds,
      this.rotativo,
      this.requiredForActivity,
      this.kind,
    );
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field supportType.id is invalid");
    }

    if (typeof this.title !== "string" || this.title.trim() === "") {
      throw new InvalidParameterError("Field supportType.title is invalid");
    }

    if (this.description !== null && typeof this.description !== "string") {
      throw new InvalidParameterError("Field supportType.description is invalid");
    }

    if (typeof this.active !== "boolean" || typeof this.rotativo !== "boolean" || typeof this.requiredForActivity !== "boolean") {
      throw new InvalidParameterError("Field supportType.active is invalid");
    }

    if (this.capacity !== null && (!Number.isInteger(this.capacity) || this.capacity < 0)) {
      throw new InvalidParameterError("Field supportType.capacity is invalid");
    }

    if (!Array.isArray(this.groupIds) || this.groupIds.some((id) => typeof id !== "string" || id.trim() === "")) {
      throw new InvalidParameterError("Field supportType.groupIds is invalid");
    }

    if (this.kind !== null && !Object.values(SupportTypeKind).includes(this.kind)) {
      throw new InvalidParameterError("Field supportType.kind is invalid");
    }
  }
}
