import { InvalidParameterError } from "../errors/app-error";

// vagas (pessoas) de um grupo na publicação do encontro; o estoque é das assistências (E2.9)
export class GroupVacancy {
  constructor(
    readonly groupId: string,
    readonly total: number | null, // null = sem limite
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.groupId !== "string" || this.groupId.trim() === "") {
      throw new InvalidParameterError("Field groupVacancy.groupId is invalid");
    }

    if (this.total !== null && (!Number.isInteger(this.total) || this.total < 0)) {
      throw new InvalidParameterError("Field groupVacancy.total is invalid");
    }
  }
}
