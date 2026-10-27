import type { User } from "../../src/serve-utils/domain/User";
import { emailHash } from "../../src/serve-utils/lib/hash";
import { AttendanceResponse } from "./AttendanceResponse";

export class UserBookingResponse {
  static fromDomain(user: User) {
    return {
      id: user.id,
      name: user.anonymizedName,
      pronoun: user.pronoun,
      email: user.anonymizedEmail,
      emailHash: emailHash(user.email),
      account: user.account ? user.account.toJson() : null,
      attendances: user.attendances.map((attendance) => AttendanceResponse.fromDomain(attendance)),
    };
  }
}
