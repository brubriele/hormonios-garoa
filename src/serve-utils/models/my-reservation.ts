import { ErrorKey, InvalidParameterError } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";
import { AttendanceSync } from "./attendance";
import { MyReservationAccessory } from "./my-reservation-accessory";

// uma reserva "vou" deste aparelho em "Minhas reservas" (GET /api/minhas-reservas), com o status do envio
export class MyReservation {
  constructor(
    readonly id: UUID,
    readonly groupId: string | null, // null = só presença
    readonly groupName: string | null, // null = sem grupo ou grupo fora do retrato
    readonly supportIds: string[],
    readonly accessories: MyReservationAccessory[], // os do retrato; id que saiu do encontro fica de fora
    readonly email: string, // o e-mail da própria pessoa: a folha preenche como o nome e o pronome
    readonly name: string,
    readonly pronoun: string,
    readonly sync: AttendanceSync,
    readonly syncError: ErrorKey | null, // key do Hormônios (SOLD_OUT_ERROR…), só quando REJECTED
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field myReservation.id is invalid");
    }

    if (this.groupId !== null && typeof this.groupId !== "string") {
      throw new InvalidParameterError("Field myReservation.groupId is invalid");
    }

    if (this.groupName !== null && typeof this.groupName !== "string") {
      throw new InvalidParameterError("Field myReservation.groupName is invalid");
    }

    if (!Array.isArray(this.supportIds) || this.supportIds.some((id) => typeof id !== "string")) {
      throw new InvalidParameterError("Field myReservation.supportIds is invalid");
    }

    if (
      !Array.isArray(this.accessories)
      || this.accessories.some((item) => !(item instanceof MyReservationAccessory))
    ) {
      throw new InvalidParameterError("Field myReservation.accessories is invalid");
    }

    if (typeof this.email !== "string" || typeof this.name !== "string" || typeof this.pronoun !== "string") {
      throw new InvalidParameterError("Field myReservation.email, name or pronoun is invalid");
    }

    if (!Object.values(AttendanceSync).includes(this.sync)) {
      throw new InvalidParameterError("Field myReservation.sync is invalid");
    }

    if (this.syncError !== null && !Object.values(ErrorKey).includes(this.syncError)) {
      throw new InvalidParameterError("Field myReservation.syncError is invalid");
    }
  }
}
