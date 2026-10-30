import { z } from "zod";
import { ErrorCtx, IntegrationEntity, IntegrationStatus } from "../../../domain/IntegrationStatus";
import { SyncStatus } from "../../../domain/SyncStatus";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

const OPERATION = "findIntegrationStatus";

const ErrorCtxSchema = z.object({
  statusCode: z.number().int(),
  error: z.string().nullable(),
  key: z.string().nullable(),
  message: z.string().nullable(),
});

const IntegrationStatusRowSchema = z.object({
  id: z.guid(),
  entity: z.enum(IntegrationEntity),
  entityId: z.guid(),
  status: z.enum(SyncStatus),
  syncAt: z.string().transform((value) => new Date(value)),
  tentatives: z.number().int(),
  nextSyncAt: z.string().nullable().transform((value) => (value ? new Date(value) : null)),
  errorCtx: ErrorCtxSchema.nullable(),
});

type IErrorCtxRow = z.infer<typeof ErrorCtxSchema>;

export class IntegrationStatusResponse {
  static toDomain(raw: unknown): IntegrationStatus {
    const row = parseResponse(IntegrationStatusRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () => {
      const errorCtx = row.errorCtx ? IntegrationStatusResponse.toErrorCtx(row.errorCtx) : null;

      return new IntegrationStatus(
        row.id,
        row.entity,
        row.entityId,
        row.status,
        row.syncAt,
        row.tentatives,
        row.nextSyncAt,
        errorCtx,
      );
    });
  }

  private static toErrorCtx(errorCtx: IErrorCtxRow): ErrorCtx {
    return new ErrorCtx(errorCtx.statusCode, errorCtx.error, errorCtx.key, errorCtx.message);
  }
}
