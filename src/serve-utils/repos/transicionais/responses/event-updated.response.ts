import { z } from "zod";
import type { IEventRef, IEventWebhookResult } from "../../../interfaces/transicionais";
import { createLogger } from "../../../lib/logger";
import { EventWebhookStatus, WebhookType } from "../../../models/transicionais-webhook";
import { parseInput } from "../../parse-response";
import { DateSchema } from "./date.schema";
import { PublicEventResponse } from "./public-event.response";

const logger = createLogger("EventUpdatedResponse");

// o dia do retrato no event: só o id importa aqui (o resto é do PublicEventResponse)
const WebhookDaySchema = z.looseObject({ id: z.unknown() });

// o retrato no formato do GET público. Fica inteiro (loose): o PublicEventResponse o valida
const WebhookEventSchema = z.looseObject({
  version: z.number().optional().catch(undefined),
  configDays: z.array(WebhookDaySchema).catch([]),
});

const EventUpdatedDataSchema = z.object({
  externalId: z.string(),
  version: z.number().optional().catch(undefined), // senão, a do event
  vacanciesAt: DateSchema.optional().catch(undefined), // senão, o occurredAt, ou agora
  event: WebhookEventSchema,
});

const EventUpdatedSchema = z.object({
  occurredAt: DateSchema.optional().catch(undefined),
  data: EventUpdatedDataSchema,
});

// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class EventUpdatedResponse {
  // o retrato vem no formato do GET público: mesmo response, com o dia do retrato atual (dúvida D35).
  // current = o encontro do retrato (null = retrato local da fase 1). Corpo inválido -> 400
  static toDomain(body: unknown, current: IEventRef | null): IEventWebhookResult {
    const { occurredAt, data } = parseInput(EventUpdatedSchema, body);

    if (!current || data.externalId !== current.externalId) {
      return { status: EventWebhookStatus.OtherEvent };
    }

    const version = data.version ?? data.event.version;
    const day = data.event.configDays.find((item) => String(item.id) === current.dayId);

    // o dia do retrato não veio (a data mudou no Transicionais) ou falta a version: a rotina relê
    if (!day || version === undefined || !Number.isInteger(version)) {
      return { status: EventWebhookStatus.Unmappable };
    }

    const vacanciesAt = data.vacanciesAt ?? occurredAt ?? new Date().toISOString();
    const ref: IEventRef = { externalId: data.externalId, dayId: current.dayId };

    try {
      return {
        status: EventWebhookStatus.Snapshot,
        snapshot: PublicEventResponse.toDomain({ ...data.event, version }, ref, vacanciesAt, WebhookType.EventUpdated),
      };
    } catch (error) {
      logger.error({ err: error, externalId: ref.externalId }, "event.updated could not be mapped (D35)");
      return { status: EventWebhookStatus.Unmappable };
    }
  }
}
