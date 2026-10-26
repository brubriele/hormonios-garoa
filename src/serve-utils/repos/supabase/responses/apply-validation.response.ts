import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { ApplyValidationResult } from "../../../models/booking";
import { parseResponse } from "../../parse-response";

// text da função aplicar_validacao
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
const ApplyValidationResultSchema = z.enum(ApplyValidationResult);

/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class ApplyValidationResponse {
  static toDomain(raw: unknown, operation: string): ApplyValidationResult {
    return parseResponse(ApplyValidationResultSchema, raw, InfraSource.Supabase, operation);
  }
}
