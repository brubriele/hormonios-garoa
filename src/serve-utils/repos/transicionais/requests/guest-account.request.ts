import type { ISendAttendancePerson } from "../../../interfaces/transicionais";

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
  static fromDomain(person: ISendAttendancePerson): IGuestAccountBody {
    return {
      type: AccountType.Guest,
      name: person.name,
      email: person.email,
      ...(person.pronoun === "" ? {} : { pronouns: person.pronoun }),
    };
  }
}
