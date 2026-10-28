import type { User } from "../../src/bff/domain/User";
import { emailHash } from "../../src/bff/lib/hash";
import { AttendanceResponse } from "./AttendanceResponse";

export class UserBookingResponse {
  static fromDomain(user: User) {
    return {
      id: user.id,
      name: user.name,
      pronoun: user.pronoun,
      email: user.anonymizedEmail,
      emailHash: emailHash(user.email),
      account: user.account ? user.account.toJson() : null,
      attendances: user.attendances.map((attendance) => AttendanceResponse.fromDomain(attendance)),
    };
  }
}
