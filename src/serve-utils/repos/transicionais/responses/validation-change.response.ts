import { z } from "zod";
import { InfraSource } from "../../../errors/infra-error";
import type { ISentAttendance } from "../../../interfaces/transicionais";
import { parseResponse } from "../../parse-response";
import { DateSchema } from "./date.schema";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "validationChange";

// o que o envio aceito devolve. Campo ausente ou fora do formato vira null: um 2xx sem eles vale
// como aceito, e o changed_at e o order_id ficam como estavam (dúvida D33)
const ValidationChangeSchema = z.object({
  guestId: TransicionaisIdSchema.nullable().catch(null),
  orderId: TransicionaisIdSchema.nullable().catch(null),
  changedAt: DateSchema.nullable().catch(null),
});

const EMPTY_VALIDATION_CHANGE: ISentAttendance = { guestId: null, orderId: null, changedAt: null };

// resposta do POST v2/community/validations/change (setup, item 6). O contrato local só diz `content`
// (201): os campos vêm nele ou na raiz (D33); sem corpo, tudo null
const ValidationChangeResponseSchema = z
  .union([
    z.object({ content: ValidationChangeSchema }).transform((body) => body.content),
    ValidationChangeSchema,
  ])
  .catch(EMPTY_VALIDATION_CHANGE);

export class ValidationChangeResponse {
  static toDomain(raw: unknown): ISentAttendance {
    return parseResponse(ValidationChangeResponseSchema, raw, InfraSource.Transicionais, OPERATION);
  }
}
