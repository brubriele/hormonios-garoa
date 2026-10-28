import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

const OPERATION = "listPublicEvents";

const EventSummarySchema = z.object({
  externalId: z.string().min(1),
});

const EventSummaryPageSchema = z.object({ content: z.array(EventSummarySchema) });

export class EventSummaryResponse {
  // spec-4 A2
  static toDomain(raw: unknown): string[] {
    const page = parseResponse(EventSummaryPageSchema, raw, InfraSource.Transicionais, OPERATION);

    return page.content.map((item) => item.externalId);
  }
}
