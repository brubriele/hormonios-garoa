import { InvalidParameterError } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";
import { AttendanceSync } from "./attendance";

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
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field adminAttendance.id is invalid");
    }

    if (typeof this.name !== "string" || typeof this.pronoun !== "string" || typeof this.createdAt !== "string") {
      throw new InvalidParameterError("Field adminAttendance.name, pronoun or createdAt is invalid");
    }

    if (this.groupId !== null && typeof this.groupId !== "string") {
      throw new InvalidParameterError("Field adminAttendance.groupId is invalid");
    }

    if (!Array.isArray(this.supportIds) || this.supportIds.some((id) => typeof id !== "string")) {
      throw new InvalidParameterError("Field adminAttendance.supportIds is invalid");
    }

    if (!Object.values(AttendanceSync).includes(this.sync)) {
      throw new InvalidParameterError("Field adminAttendance.sync is invalid");
    }
  }
}
