import { z } from "zod";
import { AdminAttendance } from "./admin-attendance";
import { AdminEvent } from "./admin-event";
import { validateSchema } from "./model-schema";

const AdminSummarySchema = z.object({
  event: z.instanceof(AdminEvent),
  attendances: z.array(z.instanceof(AdminAttendance)),
});

// o resumo da Produção (GET /api/admin/resumo, PUT /api/admin/ensaio, POST /api/admin/novo-ensaio)
export class AdminSummary {
  constructor(
    readonly event: AdminEvent,
    readonly attendances: AdminAttendance[],
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(AdminSummarySchema, this, "adminSummary");
  }
}
