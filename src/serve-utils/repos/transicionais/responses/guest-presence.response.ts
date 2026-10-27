import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import type { ITransicionaisPresence } from "../../../interfaces/transicionais";
import { AttendanceAnswer } from "../../../domain/Attendance";
import { parseResponse } from "../../parse-response";
import { ValidationAnswer } from "../requests/validation-change.request";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "guestPresence";

// item de GET v2/manager-validations/guests (só o que o envio compara, D49)
const GuestPresenceSchema = z.object({
  email: z.string().nullable(),
  hash: z.string().min(1),
  orderId: TransicionaisIdSchema.nullable(),
  answer: z.enum(ValidationAnswer),
  groupId: TransicionaisIdSchema.nullable(),
  supportTypeIds: z.array(TransicionaisIdSchema),
});

const GuestPresencePageSchema = z.object({ content: z.array(GuestPresenceSchema) });

type IGuestPresence = z.infer<typeof GuestPresenceSchema>;

export class GuestPresenceResponse {
  // o search do Transicionais acha por nome ou e-mail: fica só o item com o mesmo e-mail
  static toDomain(raw: unknown, email: string): ITransicionaisPresence | null {
    const page = parseResponse(GuestPresencePageSchema, raw, InfraSource.Transicionais, OPERATION);
    const item = page.content.find((presence) => presence.email?.toLowerCase() === email.toLowerCase());

    return item ? GuestPresenceResponse.toPresence(item) : null;
  }

  // TENTATIVE (talvez) não é resposta do Hormônios: conta como "não vou" (como no webhook, D37)
  private static toPresence(item: IGuestPresence): ITransicionaisPresence {
    const attending = item.answer === ValidationAnswer.Attending;

    return {
      hash: item.hash,
      orderId: item.orderId,
      answer: attending ? AttendanceAnswer.Going : AttendanceAnswer.NotGoing,
      groupId: attending ? item.groupId : null,
      supportTypeIds: attending ? item.supportTypeIds : [],
    };
  }
}
