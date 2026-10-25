import { InvalidParameterError } from "../errors/app-error";
import { EventDay } from "./event-day";
import { EventPublication } from "./event-publication";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// o encontro como a Produção o edita no Transicionais (a visão de manager): o id interno, a version das
// escritas, o intervalo, o ciclo, os grupos, os dias e a publicação
export class ManagedEvent {
  constructor(
    readonly id: string, // id interno do Transicionais (não é o externalId)
    readonly name: string,
    readonly startDate: string, // YYYY-MM-DD
    readonly endDate: string, // YYYY-MM-DD
    readonly categoryId: string | null, // o ciclo
    readonly createdAt: string,
    readonly version: number,
    readonly groupIds: string[],
    readonly days: EventDay[],
    readonly publication: EventPublication | null, // null = Interno
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field event.id is invalid");
    }

    if (typeof this.name !== "string" || this.name.trim() === "") {
      throw new InvalidParameterError("Field event.name is invalid");
    }

    if (!DATE_PATTERN.test(this.startDate) || !DATE_PATTERN.test(this.endDate)) {
      throw new InvalidParameterError("Field event.startDate is invalid");
    }

    if (this.categoryId !== null && (typeof this.categoryId !== "string" || this.categoryId.trim() === "")) {
      throw new InvalidParameterError("Field event.categoryId is invalid");
    }

    if (typeof this.createdAt !== "string" || Number.isNaN(Date.parse(this.createdAt))) {
      throw new InvalidParameterError("Field event.createdAt is invalid");
    }

    if (!Number.isInteger(this.version)) {
      throw new InvalidParameterError("Field event.version is invalid");
    }

    if (!Array.isArray(this.groupIds) || this.groupIds.some((id) => typeof id !== "string" || id.trim() === "")) {
      throw new InvalidParameterError("Field event.groupIds is invalid");
    }

    if (!Array.isArray(this.days) || this.days.some((day) => !(day instanceof EventDay))) {
      throw new InvalidParameterError("Field event.days is invalid");
    }

    if (this.publication !== null && !(this.publication instanceof EventPublication)) {
      throw new InvalidParameterError("Field event.publication is invalid");
    }
  }
}
