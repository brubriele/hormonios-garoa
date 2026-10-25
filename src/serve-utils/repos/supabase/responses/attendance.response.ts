import { z } from "zod";
import { ErrorKey } from "../../../errors/app-error";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import type { UUID } from "../../../interfaces/uuid";
import { Attendance, AttendanceAnswer, AttendanceSync } from "../../../models/attendance";
import type { User } from "../../../models/user";
import { parseResponse } from "../../parse-response";
import { UserResponse, UserRowSchema } from "./user.response";

// jsonb de hg_attendances.data
const AttendanceDataSchema = z.object({
  answer: z.enum(AttendanceAnswer),
  groupId: z.string().nullable(), // null = só presença
  supportIds: z.array(z.string()),
});

// linha de hg_attendances (só o que o model usa)
const AttendanceRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  day_key: z.string(),
  device_id: z.guid().transform((id) => id as UUID),
  data: AttendanceDataSchema,
  transicionais_sync: z.enum(AttendanceSync),
  sync_error: z.enum(ErrorKey).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// a linha com o hg_users embutido (select "*, hg_users(*)")
const AttendanceWithUserRowSchema = AttendanceRowSchema.extend({ hg_users: UserRowSchema });

// lista de linhas com o hg_users; a função que devolve setof (claim_pending) pode vir como uma linha
// só (o SDK tipa como linha ou lista). Sem linhas = lista vazia
const AttendanceWithUserListSchema = z
  .union([z.array(AttendanceWithUserRowSchema), AttendanceWithUserRowSchema.transform((row) => [row])])
  .default([]);

type IAttendanceRow = z.infer<typeof AttendanceRowSchema>;

export class AttendanceResponse {
  // linha com o hg_users embutido
  static toDomain(raw: unknown, operation: string): Attendance {
    const row = parseResponse(AttendanceWithUserRowSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () =>
      AttendanceResponse.fromRow(row, UserResponse.fromRow(row.hg_users)),
    );
  }

  static toDomainList(raw: unknown, operation: string): Attendance[] {
    const rows = parseResponse(AttendanceWithUserListSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () =>
      rows.map((row) => AttendanceResponse.fromRow(row, UserResponse.fromRow(row.hg_users))),
    );
  }

  // linha sem o hg_users (a função reservar), com a pessoa que o usecase já tem
  static toDomainForUser(raw: unknown, user: User, operation: string): Attendance {
    const row = parseResponse(AttendanceRowSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => AttendanceResponse.fromRow(row, user));
  }

  private static fromRow(row: IAttendanceRow, user: User): Attendance {
    return new Attendance(
      row.id,
      user,
      row.day_key,
      row.device_id,
      row.data.answer,
      row.data.groupId,
      row.data.supportIds,
      row.created_at,
      row.transicionais_sync,
      row.transicionais_sync === AttendanceSync.Rejected ? row.sync_error : null,
      row.updated_at,
    );
  }
}
