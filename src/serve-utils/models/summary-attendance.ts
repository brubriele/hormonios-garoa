import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { BookingSync } from "./booking";
import { NonBlankSchema, validateSchema } from "./model-schema";

const SummaryAttendanceSchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
  pronoun: z.string(),
  groupId: z.string().nullable(),
  supportIds: z.array(z.string()),
  createdAt: z.string(),
  sync: z.enum(BookingSync),
});

// uma presença que conta (vou e não REJECTED), no resumo da Produção (D30)
export class SummaryAttendance {
  constructor(
    readonly id: UUID,
    readonly name: string,
    readonly pronoun: string,
    readonly groupId: string | null, // null = só presença
    readonly supportIds: string[],
    readonly createdAt: string,
    readonly sync: BookingSync,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(SummaryAttendanceSchema, this, "summaryAttendance");
  }
}
