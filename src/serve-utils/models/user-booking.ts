import { z } from "zod";
import { ErrorKey } from "../errors/app-error";
import type { UUID } from "../interfaces/uuid";
import { BookingSync } from "./booking";
import { UserBookingAccessory } from "./user-booking-accessory";
import { NonBlankSchema, validateSchema } from "./model-schema";

const UserBookingSchema = z.object({
  id: NonBlankSchema,
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  supportIds: z.array(z.string()),
  accessories: z.array(z.instanceof(UserBookingAccessory)),
  email: z.string(),
  name: z.string(),
  pronoun: z.string(),
  sync: z.enum(BookingSync),
  syncError: z.enum(ErrorKey).nullable(),
});

// uma reserva "vou" deste aparelho em "Minhas reservas" (GET /api/minhas-reservas), com o status do envio
export class UserBooking {
  constructor(
    readonly id: UUID,
    readonly groupId: string | null, // null = só presença
    readonly groupName: string | null, // null = sem grupo ou grupo fora do retrato
    readonly supportIds: string[],
    readonly accessories: UserBookingAccessory[], // os do retrato; id que saiu do encontro fica de fora
    readonly email: string, // o e-mail da própria pessoa: a folha preenche como o nome e o pronome
    readonly name: string,
    readonly pronoun: string,
    readonly sync: BookingSync,
    readonly syncError: ErrorKey | null, // key do Hormônios (SOLD_OUT_ERROR…), só quando REJECTED
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(UserBookingSchema, this, "userBooking");
  }
}
