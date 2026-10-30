import { z } from "zod";
import type { Attendance } from "../../../domain/Attendance";
import type { Event } from "../../../domain/Event";
import { AttendanceMapper } from "../../../domain/mappers/AttendanceMapper";
import { SyncStatus } from "../../../domain/SyncStatus";
import { UserMapper } from "../../../domain/mappers/UserMapper";
import type { User } from "../../../domain/User";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { AttendanceDataSchema } from "./AttendanceResponse";

const OPERATION = "findUser";

const UserAccountSchema = z.object({
  id: z.number().int(),
  organizationId: z.string(),
  userId: z.string().nullable(),
  profileId: z.number().int().nullable(),
  profileGuestId: z.string().nullable(),
  customId: z.string().nullable(),
  status: z.string(),
  isOwner: z.boolean(),
  role: z.string(),
  pendingSteps: z.array(z.object({ name: z.string(), status: z.string(), condition: z.string() })),
});

const UserMetadataSchema = z.object({
  integrationId: z.union([z.string(), z.number().int().transform(String)]).nullable(),
  sync: z.enum(SyncStatus),
  syncError: z.string().nullable(),
  syncHash: z.string().nullable(),
  syncedAt: z.string().nullable(),
  version: z.number().int().nullable().default(null),
  account: UserAccountSchema.nullable().default(null),
});

// jsonb de "user".data: o User inteiro (User.toJson)
export const UserDataSchema = z.object({
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

const UserAttendanceSchema = z.object({
  data: AttendanceDataSchema,
});

// spec-8 D4
const UserWithAttendanceRowSchema = z.object({
  data: UserDataSchema,
  attendance: z.array(UserAttendanceSchema),
});

export class UserResponse {
  // as presenças vêm de outra tabela (attendance): quem as leu as passa
  static toDomain(raw: unknown, attendances: Attendance[]): User {
    const { data } = parseResponse(UserRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () =>
      UserMapper.fromData(data, attendances),
    );
  }

  // spec-8 D4
  static toDomainForEvent(raw: unknown, event: Event): User {
    const row = parseResponse(UserWithAttendanceRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () => {
      const attendances = row.attendance.map((attendance) => AttendanceMapper.fromData(attendance.data, event));

      return UserMapper.fromData(row.data, attendances);
    });
  }
}
