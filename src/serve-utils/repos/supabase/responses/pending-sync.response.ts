import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import type { UUID } from "../../../interfaces/uuid";
import { PendingEventCreation } from "../../../models/pending-event-creation";
import { PendingStockUpdate } from "../../../models/pending-stock-update";
import { PendingSyncKind } from "../../../models/pending-sync";
import { parseResponse } from "../../parse-response";

// hg_pending_syncs.data do STOCK_UPDATE
const StockUpdateDataSchema = z.object({
  supportId: z.string(),
  capacity: z.number().int(),
});

// hg_pending_syncs.data do EVENT_CREATION (IEventCreationSyncData)
const EventCreationDataSchema = z.object({
  fromExternalId: z.string(),
  fromDayKey: z.string(),
  fromDate: z.string(),
  date: z.string(),
  dayKey: z.string(),
});

const StockUpdateRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  kind: z.literal(PendingSyncKind.StockUpdate),
  data: StockUpdateDataSchema,
  updated_at: z.string(),
});

const EventCreationRowSchema = z.object({
  id: z.guid().transform((id) => id as UUID),
  kind: z.literal(PendingSyncKind.EventCreation),
  data: EventCreationDataSchema,
  updated_at: z.string(),
});

const StockUpdateListSchema = z.array(StockUpdateRowSchema);

// claim_syncs ou select ... limit 1 (lista vazia = nenhum)
const EventCreationListSchema = z.array(EventCreationRowSchema);

type IStockUpdateRow = z.infer<typeof StockUpdateRowSchema>;
type IEventCreationRow = z.infer<typeof EventCreationRowSchema>;

export class PendingSyncResponse {
  static toStockUpdates(raw: unknown, operation: string): PendingStockUpdate[] {
    const rows = parseResponse(StockUpdateListSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => rows.map(PendingSyncResponse.toStockUpdate));
  }

  static toEventCreations(raw: unknown, operation: string): PendingEventCreation[] {
    const rows = parseResponse(EventCreationListSchema, raw, InfraSource.Supabase, operation);

    return InvalidResponseError.guard(InfraSource.Supabase, operation, () => rows.map(PendingSyncResponse.toEventCreationModel));
  }

  static toEventCreation(raw: unknown, operation: string): PendingEventCreation | null {
    const row = parseResponse(EventCreationListSchema, raw, InfraSource.Supabase, operation)[0];

    return row ? InvalidResponseError.guard(InfraSource.Supabase, operation, () => PendingSyncResponse.toEventCreationModel(row)) : null;
  }

  private static toStockUpdate(row: IStockUpdateRow): PendingStockUpdate {
    return new PendingStockUpdate(row.id, row.data.supportId, row.data.capacity, row.updated_at);
  }

  private static toEventCreationModel(row: IEventCreationRow): PendingEventCreation {
    return new PendingEventCreation(
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
