import { z } from "zod";
import { NonBlankSchema, validateSchema } from "./model-schema";

const MyReservationAccessorySchema = z.object({
  id: NonBlankSchema,
  name: z.string(),
});

// acessório de uma reserva em "Minhas reservas" (só os que ainda estão no retrato, D30)
export class MyReservationAccessory {
  constructor(
    readonly id: string,
    readonly name: string,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(MyReservationAccessorySchema, this, "myReservationAccessory");
  }
}
