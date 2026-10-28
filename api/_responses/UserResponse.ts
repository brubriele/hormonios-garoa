import type { User } from "../../src/bff/domain/User";
import { AttendanceResponse } from "./AttendanceResponse";

export class UserResponse {
  static fromDomain(user: User) {
    return {
      id: user.id,
      name: user.name,
      pronoun: user.pronoun,
      email: user.email,
      attendances: user.attendances.map((attendance) => AttendanceResponse.fromDomain(attendance)),
    };
  }
}
