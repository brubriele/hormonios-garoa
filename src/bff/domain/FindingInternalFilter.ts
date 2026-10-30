import { z } from "zod";
import { CountSchema, UuidSchema, validateSchema } from "../lib/schema";

// spec-8 D2
export enum EventPosition {
  Current = "CURRENT",
  Next = "NEXT",
}

export interface IFindingInternalFilterData {
  position?: EventPosition;
  eventId?: string;
  integrationId?: number;
}

const FindingInternalFilterSchema = z
  .object({
    position: z.enum(EventPosition).nullable(),
    eventId: UuidSchema.nullable(),
    integrationId: CountSchema.nullable(),
  })
  .refine((filter) => filter.position !== null || filter.eventId !== null || filter.integrationId !== null, {
    path: ["position"],
    message: "is required without eventId or integrationId",
  });

// um ensaio por vez: pela posição (atual ou próximo) ou pelo id (spec-8 D2, D3)
export class FindingInternalFilter {
  readonly position: EventPosition | null;
  readonly eventId: string | null;
  readonly integrationId: number | null;

  constructor({ position, eventId, integrationId }: IFindingInternalFilterData) {
    this.position = position ?? null;
    this.eventId = eventId ?? null;
    this.integrationId = integrationId ?? null;
    this.validate();
  }

  private validate() {
    validateSchema(FindingInternalFilterSchema, this, "filter");
  }
}
