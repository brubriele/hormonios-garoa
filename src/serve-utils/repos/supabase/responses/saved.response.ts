import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

// boolean das funções com trava (gravar_retrato, marcar_sync, gravar_vagas): true = gravou.
// Sem valor (null) = não gravou
const SavedSchema = z.boolean().default(false);

export class SavedResponse {
  static toDomain(raw: unknown, operation: string): boolean {
    return parseResponse(SavedSchema, raw, InfraSource.Supabase, operation);
  }
}
