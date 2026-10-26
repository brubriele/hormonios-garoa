import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import type { UUID } from "../../../interfaces/uuid";
import { PendingNextEvent } from "../../../models/pending-next-event";
import { PendingSupportCapacity } from "../../../models/pending-support-capacity";
import { PendingWriteKind } from "../../../models/pending-write";
import { parseResponse } from "../../parse-response";

// hg_pending_writes.data do SUPPORT_CAPACITY
const SupportCapacityDataSchema = z.object({
  supportId: z.string(),
  capacity: z.number().int(),
});

// hg_pending_writes.data do NEXT_EVENT (INextEventWriteData)
const NextEventDataSchema = z.object({
  fromExternalId: z.string(),
  fromDayKey: z.string(),
  fromDate: z.string(),
  date: z.string(),
  dayKey: z.string(),
});

const SupportCapacityRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  kind: z.literal(PendingWriteKind.SupportCapacity),
  data: SupportCapacityDataSchema,
  updated_at: z.string(),
});

const NextEventRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  kind: z.literal(PendingWriteKind.NextEvent),
  data: NextEventDataSchema,
  updated_at: z.string(),
});

const SupportCapacityListSchema = z.array(SupportCapacityRowSchema);

// claim_escritas ou select ... limit 1 (lista vazia = nenhum)
const NextEventListSchema = z.array(NextEventRowSchema);

type ISupportCapacityRow = z.infer<typeof SupportCapacityRowSchema>;
type INextEventRow = z.infer<typeof NextEventRowSchema>;

export class PendingWriteResponse {
  static toSupportCapacities(raw: unknown, operation: string): PendingSupportCapacity[] {
    const rows = parseResponse(SupportCapacityListSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => rows.map(PendingWriteResponse.toSupportCapacity));
  }

  static toNextEvents(raw: unknown, operation: string): PendingNextEvent[] {
    const rows = parseResponse(NextEventListSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => rows.map(PendingWriteResponse.toNextEventModel));
  }

  static toNextEvent(raw: unknown, operation: string): PendingNextEvent | null {
    const row = parseResponse(NextEventListSchema, raw, InfraSource.Supabase, operation)[0];

    return row ? InvalidResponseError.guard(InfraSource.Supabase, operation, () => PendingWriteResponse.toNextEventModel(row)) : null;
  }

  private static toSupportCapacity(row: ISupportCapacityRow): PendingSupportCapacity {
    return new PendingSupportCapacity(row.id, row.data.supportId, row.data.capacity, row.updated_at);
  }

  private static toNextEventModel(row: INextEventRow): PendingNextEvent {
    return new PendingNextEvent(
      row.id,
      row.data.fromExternalId,
      row.data.fromDayKey,
      row.data.fromDate,
      row.data.date,
      row.data.dayKey,
      row.updated_at,
    );
  }
}
