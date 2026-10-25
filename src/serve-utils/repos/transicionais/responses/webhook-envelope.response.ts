import { z } from "zod";
import type { IWebhookEnvelope } from "../../../interfaces/transicionais";
import { WebhookType } from "../../../models/transicionais-webhook";
import { parseInput } from "../../parse-response";

// texto com algum caractere além de espaço (o valor fica como veio)
const NonBlankSchema = z.string().refine((value) => value.trim() !== "");

const KNOWN_TYPES: string[] = Object.values(WebhookType).filter((type) => type !== WebhookType.Other);

// envelope { deliveryId, type, occurredAt, organizationId, data } (bff-fase-2.md, "Webhooks"). O data
// é lido pelo response de cada tipo
const WebhookEnvelopeSchema = z.object({
  deliveryId: NonBlankSchema,
  type: NonBlankSchema,
});

// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class WebhookEnvelopeResponse {
  // corpo inválido -> InvalidParameterError (400, dúvida D38)
  static toDomain(body: unknown): IWebhookEnvelope {
    const envelope = parseInput(WebhookEnvelopeSchema, body);
    const type = KNOWN_TYPES.includes(envelope.type) ? (envelope.type as WebhookType) : WebhookType.Other;

    return { deliveryId: envelope.deliveryId, type, rawType: envelope.type };
  }
}
