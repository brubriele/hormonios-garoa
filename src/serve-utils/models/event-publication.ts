import { InvalidParameterError } from "../errors/app-error";
import { GroupVacancy } from "./group-vacancy";

// visibilidade da publicação do encontro no Transicionais (Interno = sem publicação)
export enum EventVisibility {
  Public = "PUBLIC",
  Private = "PRIVATE",
}

function isOptionalDate(value: string | null): boolean {
  return value === null || (typeof value === "string" && !Number.isNaN(Date.parse(value)));
}

// a publicação (o `public`) de um encontro: link, abertura das reservas (D1), assistências e vagas
export class EventPublication {
  constructor(
    readonly id: string, // o id do link público (= externalId, D6)
    readonly visibility: EventVisibility,
    readonly description: string | null,
    readonly releaseAt: string | null,
    readonly membersEarlyAt: string | null,
    readonly guestDeadlineMinutes: number | null, // prazo do convidado: abre/fecha as reservas (D1)
    readonly supportIds: string[], // todas as assistências oferecidas (instrumentos e acessórios)
    readonly totalVacancies: number | null, // null = sem limite
    readonly groupVacancies: GroupVacancy[],
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field publication.id is invalid");
    }

    if (!Object.values(EventVisibility).includes(this.visibility)) {
      throw new InvalidParameterError("Field publication.visibility is invalid");
    }

    if (this.description !== null && typeof this.description !== "string") {
      throw new InvalidParameterError("Field publication.description is invalid");
    }

    if (!isOptionalDate(this.releaseAt) || !isOptionalDate(this.membersEarlyAt)) {
      throw new InvalidParameterError("Field publication.releaseAt is invalid");
    }

    if (
      this.guestDeadlineMinutes !== null
      && (!Number.isInteger(this.guestDeadlineMinutes) || this.guestDeadlineMinutes < 0)
    ) {
      throw new InvalidParameterError("Field publication.guestDeadlineMinutes is invalid");
    }

    if (!Array.isArray(this.supportIds) || this.supportIds.some((id) => typeof id !== "string" || id.trim() === "")) {
      throw new InvalidParameterError("Field publication.supportIds is invalid");
    }

    if (this.totalVacancies !== null && (!Number.isInteger(this.totalVacancies) || this.totalVacancies < 0)) {
      throw new InvalidParameterError("Field publication.totalVacancies is invalid");
    }

    if (!Array.isArray(this.groupVacancies) || this.groupVacancies.some((item) => !(item instanceof GroupVacancy))) {
      throw new InvalidParameterError("Field publication.groupVacancies is invalid");
    }
  }
}
