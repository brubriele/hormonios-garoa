import { InvalidParameterError } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";
import { User } from "./user";

export type AttendanceAnswer = "vou" | "nao-vou";

const ANSWERS: readonly AttendanceAnswer[] = ["vou", "nao-vou"];

export type AttendanceSync = "PENDING" | "SYNCED" | "REJECTED";

const SYNCS: readonly AttendanceSync[] = ["PENDING", "SYNCED", "REJECTED"];

export class Attendance {
  constructor(
    readonly id: UUID,
    readonly user: User,
    readonly dayKey: string,
    readonly deviceId: UUID,
    readonly answer: AttendanceAnswer,
    readonly groupId: string | null, // null = só presença
    readonly supportIds: string[],
    readonly createdAt: string,
    readonly sync: AttendanceSync = "PENDING",
  ) {
    this.validate();
  }

  private validate() {
    if (!(this.user instanceof User)) {
      throw new InvalidParameterError("Field user is invalid");
    }

    if (typeof this.dayKey !== "string" || this.dayKey.trim() === "") {
      throw new InvalidParameterError("Field dayKey is invalid");
    }

    if (!ANSWERS.includes(this.answer)) {
      throw new InvalidParameterError("Field answer is invalid");
    }

    if (this.groupId !== null && (typeof this.groupId !== "string" || this.groupId.trim() === "")) {
      throw new InvalidParameterError("Field groupId is invalid");
    }

    if (!Array.isArray(this.supportIds) || this.supportIds.some((id) => typeof id !== "string" || id.trim() === "")) {
      throw new InvalidParameterError("Field supportIds is invalid");
    }

    if (this.groupId === null && this.supportIds.length > 0) {
      throw new InvalidParameterError("Field supportIds must be empty without groupId");
    }

    if (typeof this.createdAt !== "string" || this.createdAt.trim() === "") {
      throw new InvalidParameterError("Field createdAt is invalid");
    }

    if (!SYNCS.includes(this.sync)) {
      throw new InvalidParameterError("Field sync is invalid");
    }
  }

  // REJECTED não ocupa vaga e não conta como reserva
  get isGoing(): boolean {
    return this.answer === "vou" && this.sync !== "REJECTED";
  }

  get isPending(): boolean {
    return this.sync === "PENDING";
  }
}
