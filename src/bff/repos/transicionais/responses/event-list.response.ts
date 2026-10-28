import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import type { IManagedEventItem } from "../../../interfaces/transicionais";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "listEvents";

// item de GET v2/manager-events/details?startAt= (todas as visibilidades): acha o recém-criado (D18)
const EventItemSchema = z.object({
  id: TransicionaisIdSchema,
  name: z.string(),
  startAt: z.string().transform((date) => date.slice(0, 10)),
  // ausente, vazio ou fora do formato = Interno (sem link público)
  externalId: z.string().nullable().catch(null).transform((id) => id || null),
});

const EventListSchema = z.object({ content: z.array(EventItemSchema) });

export class EventListResponse {
  static toDomain(raw: unknown): IManagedEventItem[] {
    return parseResponse(EventListSchema, raw, InfraSource.Transicionais, OPERATION).content.map((item) => ({
      id: item.id,
      name: item.name,
      date: item.startAt,
      externalId: item.externalId,
    }));
  }
}
