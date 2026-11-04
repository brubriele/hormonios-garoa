import { z } from "zod";
import { Event } from "../../../domain/Event";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

const OPERATION = "updateCurrentEvent";

// spec-8 B1
const CurrentEventRowSchema = z.object({
  isActive: z.boolean(),
});

export class CurrentEventResponse {
  // spec-8 C1
  static toDomain(raw: unknown, event: Event): Event {
    const row = parseResponse(CurrentEventRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(
      InfraSource.Supabase,
      OPERATION,
      () =>
        new Event(
          event.id,
          event.location,
          event.whatsappUrl,
          event.date,
          event.startTime,
          row.isActive,
          event.groups,
          event.catalog,
          event.metadata,
          event.goingCount,
        ),
    );
  }
}
