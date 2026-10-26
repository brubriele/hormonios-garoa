import { z } from "zod";
import { SummaryAttendance } from "./summary-attendance";
import { SummaryEvent } from "./summary-event";
import { validateSchema } from "./model-schema";

const CurrentEventSummarySchema = z.object({
  event: z.instanceof(SummaryEvent),
  attendances: z.array(z.instanceof(SummaryAttendance)),
});

// o resumo da Produção (GET /api/admin/resumo, PUT /api/admin/ensaio, POST /api/admin/novo-ensaio)
export class CurrentEventSummary {
  constructor(
    readonly event: SummaryEvent,
    readonly attendances: SummaryAttendance[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(CurrentEventSummarySchema, this, "currentEventSummary");
  }
}
