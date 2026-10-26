import { z } from "zod";
import { AdminBooking } from "./admin-booking";
import { AdminEvent } from "./admin-event";
import { validateSchema } from "./model-schema";

const CurrentEventSummarySchema = z.object({
  event: z.instanceof(AdminEvent),
  attendances: z.array(z.instanceof(AdminBooking)),
});

// o resumo da Produção (GET /api/admin/resumo, PUT /api/admin/ensaio, POST /api/admin/novo-ensaio)
export class CurrentEventSummary {
  constructor(
    readonly event: AdminEvent,
    readonly attendances: AdminBooking[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(CurrentEventSummarySchema, this, "currentEventSummary");
  }
}
