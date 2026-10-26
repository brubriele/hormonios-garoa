import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { NonBlankSchema, validateSchema } from "./model-schema";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UserSchema = z.object({
  email: z.string().regex(EMAIL_PATTERN).refine((email) => email === email.toLowerCase()), // R15
  name: NonBlankSchema,
  pronoun: NonBlankSchema,
});

export class User {
  constructor(
    readonly id: UUID,
    readonly email: string, // minúsculas, sem espaços (R15)
    readonly name: string,
    readonly pronoun: string,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(UserSchema, this);
  }
}
