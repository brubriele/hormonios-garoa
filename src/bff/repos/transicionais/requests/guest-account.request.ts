import type { User } from "../../../domain/User";

// tipo de cadastro: por enquanto o Transicionais só cadastra convidado
export enum AccountType {
  Guest = "GUEST",
}

// corpo do POST v2/manager-organization/users (OrganizationUserCreateRequest, D41)
export interface IGuestAccountBody {
  type: AccountType;
  name: string;
  email: string;
  pronouns?: string; // ausente = sem pronome
}

export class GuestAccountRequest {
  static fromDomain(user: User): IGuestAccountBody {
    const body: IGuestAccountBody = { type: AccountType.Guest, name: user.name, email: user.email };

    if (user.pronoun !== "") {
      body.pronouns = user.pronoun;
    }

    return body;
  }
}
