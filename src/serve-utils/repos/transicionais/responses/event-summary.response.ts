import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import type { IEventRef } from "../../../interfaces/transicionais";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "listEvents";

// item de GET v2/manager-events/details?visibility=PUBLIC&startAt= (só o que o Hormônios lê)
const EventSummarySchema = z.object({
  id: z.number().int(), // id interno: só as escritas de manager usam, não sai do repo
  externalId: z.string().min(1), // o da URL pública (= public.id)
  configDayId: TransicionaisIdSchema, // o dia atual (= dayKey)
});

const EventSummaryPageSchema = z.object({ content: z.array(EventSummarySchema) });

export type IEventSummary = z.infer<typeof EventSummarySchema>;

export class EventSummaryResponse {
  // a página validada, na ordem da API (startAt asc)
  static parse(raw: unknown): IEventSummary[] {
    return parseResponse(EventSummaryPageSchema, raw, InfraSource.Transicionais, OPERATION).content;
  }

  static toDomain(raw: unknown): IEventRef[] {
    return EventSummaryResponse.parse(raw).map((item) => ({ externalId: item.externalId, dayId: item.configDayId }));
  }
}
