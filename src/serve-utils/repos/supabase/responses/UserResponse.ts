import { z } from "zod";
import type { Attendance } from "../../../domain/Attendance";
import { SyncStatus } from "../../../domain/SyncStatus";
import { UserMapper } from "../../../domain/mappers/UserMapper";
import type { User } from "../../../domain/User";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

const OPERATION = "findUser";

const UserMetadataSchema = z.object({
  integrationId: z.union([z.string(), z.number().int().transform(String)]).nullable(),
  sync: z.enum(SyncStatus),
  syncError: z.string().nullable(),
  syncHash: z.string().nullable(),
  syncedAt: z.string().nullable(),
});

// jsonb de "user".data: o User inteiro (User.toJson)
const UserDataSchema = z.object({
  id: z.guid(),
  name: z.string(),
  pronoun: z.string(),
  email: z.string(),
  metadata: UserMetadataSchema,
});

// linha de "user" (só o data: as outras colunas são do repo)
const UserRowSchema = z.object({
  data: UserDataSchema,
});

export class UserResponse {
  // as presenças vêm de outra tabela (attendance): quem as leu as passa
  static toDomain(raw: unknown, attendances: Attendance[]): User {
    const { data } = parseResponse(UserRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () =>
      UserMapper.fromData(data, attendances),
    );
  }
}
