import { z } from "zod";
import type { UUID } from "../interfaces/uuid";
import { AttendanceSync } from "./attendance";
import { NonBlankSchema, validateSchema } from "./model-schema";

const AdminAttendanceSchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
  pronoun: z.string(),
  groupId: z.string().nullable(),
  supportIds: z.array(z.string()),
  createdAt: z.string(),
  sync: z.enum(AttendanceSync),
});

// uma presença que conta (vou e não REJECTED), no resumo da Produção (D30)
export class AdminAttendance {
  constructor(
    readonly id: UUID,
    readonly name: string,
    readonly pronoun: string,
    readonly groupId: string | null, // null = só presença
    readonly supportIds: string[],
    readonly createdAt: string,
    readonly sync: AttendanceSync,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(AdminAttendanceSchema, this, "adminAttendance");
  }
}
