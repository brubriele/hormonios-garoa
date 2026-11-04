import { z } from "zod";
import { type Attendance, AttendanceAnswer } from "../../../domain/Attendance";
import type { Event } from "../../../domain/Event";
import { AttendanceMapper } from "../../../domain/mappers/AttendanceMapper";
import { SyncStatus } from "../../../domain/SyncStatus";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

const OPERATION = "findAttendance";

const AttendanceMetadataSchema = z.object({
  userId: z.guid(),
  integrationId: z.number().int().nullable(),
  deviceId: z.string(),
  answer: z.enum(AttendanceAnswer),
  sync: z.enum(SyncStatus),
  syncError: z.string().nullable(),
  syncHash: z.string().nullable(),
  syncedAt: z.string().nullable(),
  version: z.number().int().nullable().default(null),
});

// jsonb de attendance.data: a Attendance inteira (Attendance.toJson)
export const AttendanceDataSchema = z.object({
  id: z.guid(),
  eventId: z.guid(),
  groupId: z.string().optional().transform((id) => id ?? null), // ausente = só presença
  supportIds: z.array(z.string()),
  createdAt: z.string(),
  metadata: AttendanceMetadataSchema,
});

// linha de attendance (só o data: as outras colunas são do repo)
const AttendanceRowSchema = z.object({
  data: AttendanceDataSchema,
});

export class AttendanceResponse {
  static toDomain(raw: unknown, event: Event): Attendance {
    const row = parseResponse(AttendanceRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () => AttendanceMapper.fromData(row.data, event));
  }
}
