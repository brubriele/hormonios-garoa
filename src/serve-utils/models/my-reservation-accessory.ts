import { InvalidParameterError } from "../errors/app-error";

// acessório de uma reserva em "Minhas reservas" (só os que ainda estão no retrato, D30)
export class MyReservationAccessory {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field myReservationAccessory.id is invalid");
    }

    if (typeof this.name !== "string") {
      throw new InvalidParameterError("Field myReservationAccessory.name is invalid");
    }
  }
}
