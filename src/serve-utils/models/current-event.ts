import { InvalidParameterError } from "../errors/app-error";

function isStock(value: number | null): boolean {
  return value === null || (Number.isInteger(value) && value >= 0);
}

// o instrumento do encontro: o grupo do Transicionais com a assistência type='instrumento' dele (E2.9)
export class Group {
  constructor(
    readonly id: string, // grupo do Transicionais (o id da reserva)
    readonly name: string, // título da assistência do instrumento
    readonly stockTotal: number | null, // capacity da assistência; null = sem limite
    readonly active: boolean,
    readonly taken: number | null = null, // occupied do dia no Transicionais; null = retrato local (conta da fase 1)
    // assistência do instrumento. Interna ao BFF, fora das respostas de /api. A reserva com este grupo
    // a manda em supportTypeIds, junto dos acessórios
    readonly instrumentSupportId: string | null = null,
    readonly rotativo: boolean = false, // pode passar da capacidade
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

    if (!isStock(this.stockTotal)) {
      throw new InvalidParameterError("Field group.stockTotal is invalid");
    }

    if (typeof this.active !== "boolean") {
      throw new InvalidParameterError("Field group.active is invalid");
    }

    if (this.taken !== null && (!Number.isInteger(this.taken) || this.taken < 0)) {
      throw new InvalidParameterError("Field group.taken is invalid");
    }

    if (
      this.instrumentSupportId !== null
      && (typeof this.instrumentSupportId !== "string" || this.instrumentSupportId.trim() === "")
    ) {
      throw new InvalidParameterError("Field group.instrumentSupportId is invalid");
    }

    if (typeof this.rotativo !== "boolean") {
      throw new InvalidParameterError("Field group.rotativo is invalid");
    }
  }
}

// acessório: assistência type='acessorio'. Os defaults são os do retrato local da fase 1
// (sem limite, não rotativo, vale para todos os grupos)
export class Support {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly stockTotal: number | null = null, // capacity; null = sem limite
    readonly taken: number | null = null, // occupied do dia no Transicionais; null = retrato local
    readonly rotativo: boolean = false,
    readonly groupIds: string[] = [], // vazio = vale para todos os grupos
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

    if (!isStock(this.stockTotal)) {
      throw new InvalidParameterError("Field support.stockTotal is invalid");
    }

    if (this.taken !== null && (!Number.isInteger(this.taken) || this.taken < 0)) {
      throw new InvalidParameterError("Field support.taken is invalid");
    }

    if (typeof this.rotativo !== "boolean") {
      throw new InvalidParameterError("Field support.rotativo is invalid");
    }

    if (
      !Array.isArray(this.groupIds)
      || this.groupIds.some((groupId) => typeof groupId !== "string" || groupId.trim() === "")
    ) {
      throw new InvalidParameterError("Field support.groupIds is invalid");
    }
  }

  appliesTo(groupId: string): boolean {
    return this.groupIds.length === 0 || this.groupIds.includes(groupId);
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
    readonly externalId: string | null = null, // encontro no Transicionais; null = retrato local da fase 1
    readonly fetchedAt: string | null = null, // ISO da última leitura do Transicionais
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

    if (this.externalId !== null && (typeof this.externalId !== "string" || this.externalId.trim() === "")) {
      throw new InvalidParameterError("Field externalId is invalid");
    }

    if (this.fetchedAt !== null && typeof this.fetchedAt !== "string") {
      throw new InvalidParameterError("Field fetchedAt is invalid");
    }
  }

  get isFromTransicionais(): boolean {
    return this.externalId !== null;
  }

  findGroup(id: string): Group | null {
    return this.groups.find((group) => group.id === id) ?? null;
  }

  // acessórios que valem para o instrumento do grupo (groupIds vazio ou com o grupo)
  supportsForGroup(groupId: string): Support[] {
    return this.supports.filter((support) => support.appliesTo(groupId));
  }
}
