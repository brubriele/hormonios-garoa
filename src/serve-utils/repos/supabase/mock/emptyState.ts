import type { Event } from "../../../domain/Event";
import { EventResponse } from "../responses/EventResponse";
import rows from "./emptyState.json";

export function emptyState(): Event {
  const [row] = rows;

  return EventResponse.toDomain(row);
}
