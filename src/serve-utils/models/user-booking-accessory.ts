import { z } from "zod";
import { NonBlankSchema, validateSchema } from "./model-schema";

const UserBookingAccessorySchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
});

// acessório de uma reserva em "Minhas reservas" (só os que ainda estão no retrato, D30)
export class UserBookingAccessory {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(UserBookingAccessorySchema, this, "userBookingAccessory");
  }
}
