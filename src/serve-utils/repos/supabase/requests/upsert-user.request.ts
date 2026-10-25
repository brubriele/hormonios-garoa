import type { IUpsertUserData } from "../../../interfaces/hormonios";

// upsert de hg_users pelo email: o mesmo e-mail com outro nome troca o nome e o pronome
export interface IUpsertUserBody {
  email: string;
  name: string;
  pronoun: string;
  updated_at: string;
}

export class UpsertUserRequest {
  static fromDomain(data: IUpsertUserData, now: string): IUpsertUserBody {
    return { email: data.email, name: data.name, pronoun: data.pronoun, updated_at: now };
  }
}
