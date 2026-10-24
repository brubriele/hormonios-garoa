import { InvalidParameterError } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    if (typeof this.email !== "string" || !EMAIL_PATTERN.test(this.email) || this.email !== this.email.toLowerCase()) {
      throw new InvalidParameterError("Field email is invalid");
    }

    if (typeof this.name !== "string" || this.name.trim() === "") {
      throw new InvalidParameterError("Field name is invalid");
    }

    if (typeof this.pronoun !== "string" || this.pronoun.trim() === "") {
      throw new InvalidParameterError("Field pronoun is invalid");
    }
  }
}
