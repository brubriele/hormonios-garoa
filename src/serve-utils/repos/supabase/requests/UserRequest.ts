import type { User } from "../../../domain/User";

// linha de "user": o User inteiro vai em data; o email repete em coluna (único, a busca)
export interface RowUser {
  id: string;
  email: string;
  data: ReturnType<User["toJson"]>;
  updated_at: string;
}

export class UserRequest {
  static fromDomain(user: User, now: string): RowUser {
    return {
      id: user.id,
      email: user.email,
      data: user.toJson(),
      updated_at: now,
    };
  }
}
