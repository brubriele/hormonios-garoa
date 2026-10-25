import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import type { UUID } from "../../../interfaces/uuid";
import { User } from "../../../models/user";
import { parseResponse } from "../../parse-response";

// linha de hg_users
export const UserRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  email: z.string(),
  name: z.string(),
  pronoun: z.string(),
});

export type IUserRow = z.infer<typeof UserRowSchema>;

export class UserResponse {
  static toDomain(raw: unknown, operation: string): User {
    const row = parseResponse(UserRowSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => UserResponse.fromRow(row));
  }

  // linha já validada (ex.: o hg_users embutido numa reserva)
  static fromRow(row: IUserRow): User {
    return new User(row.id, row.email, row.name, row.pronoun);
  }
}
