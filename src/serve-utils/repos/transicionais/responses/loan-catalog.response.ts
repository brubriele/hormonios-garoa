import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { LoanCatalog, LoanCatalogKind } from "../../../models/loan-catalog";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "findLoanCatalog";

// GET v2/manager-support-types/{id}: o catálogo da assistência (D26)
const LoanCatalogSchema = z.object({
  id: TransicionaisIdSchema,
  title: z.string(),
  description: z.string().nullable().default(null),
  isActive: z.boolean(),
  capacity: z.number().int().nullable(), // null = sem limite
  groupIds: z.array(TransicionaisIdSchema).default([]),
  rotativo: z.boolean(),
  requiredForActivity: z.boolean(),
  type: z.enum(LoanCatalogKind).nullable().default(null), // ainda fora do contrato local (D23)
});

export class LoanCatalogResponse {
  static toDomain(raw: unknown): LoanCatalog {
    const support = parseResponse(LoanCatalogSchema, raw, InfraSource.Transicionais, OPERATION);

    return InvalidResponseError.guard(
      InfraSource.Transicionais,
      OPERATION,
      () =>
        new LoanCatalog(
          support.id,
          support.title,
          support.description,
          support.isActive,
          support.capacity,
          support.groupIds,
          support.rotativo,
          support.requiredForActivity,
          support.type,
        ),
    );
  }
}
