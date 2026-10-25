import { InvalidParameterError } from "../errors/app-error";
import { AdminAttendance } from "./admin-attendance";
import { AdminEvent } from "./admin-event";

// o resumo da Produção (GET /api/admin/resumo, PUT /api/admin/ensaio, POST /api/admin/novo-ensaio)
export class AdminSummary {
  constructor(
    readonly event: AdminEvent,
    readonly attendances: AdminAttendance[],
  ) {
    this.validate();
  }

  private validate() {
    if (!(this.event instanceof AdminEvent)) {
      throw new InvalidParameterError("Field adminSummary.event is invalid");
    }

    if (!Array.isArray(this.attendances) || this.attendances.some((item) => !(item instanceof AdminAttendance))) {
      throw new InvalidParameterError("Field adminSummary.attendances is invalid");
    }
  }
}
