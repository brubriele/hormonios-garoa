import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "findLoanCatalog";

export enum LoanCatalogKind {
  Instrument = "instrumento",
  Accessory = "acessorio",
}

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
  static toDomain(raw: unknown): any {
    const support = parseResponse(LoanCatalogSchema, raw, InfraSource.Transicionais, OPERATION);

    return InvalidResponseError.guard(InfraSource.Transicionais, OPERATION, () => support);
  }
}
