import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

// linhas inseridas em hg_webhook_deliveries (on conflict do nothing): nenhuma = entrega repetida
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
const WebhookDeliveryRowSchema = z.object({ delivery_id: z.string() });
const WebhookDeliveryRowsSchema = z.array(WebhookDeliveryRowSchema).default([]);

/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class WebhookDeliveryResponse {
  // true = entrega nova
  static toDomain(raw: unknown, operation: string): boolean {
    return parseResponse(WebhookDeliveryRowsSchema, raw, InfraSource.Supabase, operation).length > 0;
  }
}
