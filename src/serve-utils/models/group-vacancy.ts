import { z } from "zod";
import { CountSchema, NonBlankSchema, validateSchema } from "./model-schema";

const GroupVacancySchema = z.object({
  groupId: NonBlankSchema,
  total: CountSchema.nullable(),
});

// vagas (pessoas) de um grupo na publicação do encontro; o estoque é das assistências (E2.9)
export class GroupVacancy {
  constructor(
    readonly groupId: string,
    readonly total: number | null, // null = sem limite
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(GroupVacancySchema, this, "groupVacancy");
  }
}
