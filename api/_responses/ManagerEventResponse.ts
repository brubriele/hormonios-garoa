import type { ManagerEvent } from "../../src/bff/domain/ManagerEvent";
import { EventResponse } from "./EventResponse";
import { UserResponse } from "./UserResponse";

export class ManagerEventResponse {
  static fromDomain(managerEvent: ManagerEvent) {
    return {
      event: EventResponse.fromDomain(managerEvent.event),
      users: managerEvent.users.map((user) => UserResponse.fromDomain(user)),
    };
  }
}
