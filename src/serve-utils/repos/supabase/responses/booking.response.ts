import { z } from "zod";
import { ErrorKey } from "../../../errors/app-error";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import type { UUID } from "../../../interfaces/uuid";
import { Booking, BookingAnswer, BookingSync } from "../../../models/booking";
import type { User } from "../../../models/user";
import { parseResponse } from "../../parse-response";
import { UserResponse, UserRowSchema } from "./user.response";

// jsonb de hg_attendances.data
const BookingDataSchema = z.object({
  answer: z.enum(BookingAnswer),
  groupId: z.string().nullable(), // null = só presença
  supportIds: z.array(z.string()),
});

// linha de hg_attendances (só o que o model usa)
const BookingRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  day_key: z.string(),
  device_id: z.guid().transform((id) => id as UUID),
  data: BookingDataSchema,
  transicionais_sync: z.enum(BookingSync),
  sync_error: z.enum(ErrorKey).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// a linha com o hg_users embutido (select "*, hg_users(*)")
const BookingWithUserRowSchema = BookingRowSchema.extend({ hg_users: UserRowSchema });

// lista de linhas com o hg_users; a função que devolve setof (claim_pending) pode vir como uma linha
// só (o SDK tipa como linha ou lista). Sem linhas = lista vazia
const BookingWithUserListSchema = z
  .union([z.array(BookingWithUserRowSchema), BookingWithUserRowSchema.transform((row) => [row])])
  .default([]);

type IBookingRow = z.infer<typeof BookingRowSchema>;

export class BookingResponse {
  // linha com o hg_users embutido
  static toDomain(raw: unknown, operation: string): Booking {
    const row = parseResponse(BookingWithUserRowSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () =>
      BookingResponse.fromRow(row, UserResponse.fromRow(row.hg_users)),
    );
  }

  static toDomainList(raw: unknown, operation: string): Booking[] {
    const rows = parseResponse(BookingWithUserListSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () =>
      rows.map((row) => BookingResponse.fromRow(row, UserResponse.fromRow(row.hg_users))),
    );
  }

  // linha sem o hg_users (a função reservar), com a pessoa que o usecase já tem
  static toDomainForUser(raw: unknown, user: User, operation: string): Booking {
    const row = parseResponse(BookingRowSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => BookingResponse.fromRow(row, user));
  }

  private static fromRow(row: IBookingRow, user: User): Booking {
    return new Booking(
      row.id,
      user,
      row.day_key,
      row.device_id,
      row.data.answer,
      row.data.groupId,
      row.data.supportIds,
      row.created_at,
      row.transicionais_sync,
      row.transicionais_sync === BookingSync.Rejected ? row.sync_error : null,
      row.updated_at,
    );
  }
}
