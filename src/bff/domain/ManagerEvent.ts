import { User } from "./User";
import { Event } from "./Event";

export class ManagerEvent {
  constructor(
    readonly event: Event,
    readonly users: User[], // attendance não precisa do evento novamente, então mapeia com o event.id
  ) {}

  // D19
  toJson() {
    const event = this.event.toJson();
    const users = this.users.map((user) => {
      const attendances = user.attendances.map((attendance) => attendance.toJson());

      return { ...user.toJson(), attendances };
    });

    return { event, users };
  }
}
