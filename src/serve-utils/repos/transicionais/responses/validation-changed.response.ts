import { z } from "zod";
import type { IWebhookValidation } from "../../../interfaces/transicionais";
import { AttendanceAnswer } from "../../../models/attendance";
import { parseInput } from "../../parse-response";
import { ValidationAnswer } from "../requests/validation-change.request";
import { DateSchema } from "./date.schema";
import { TransicionaisIdSchema } from "../transicionais-id";

// id que pode faltar ou vir fora do formato: vira null
const OptionalIdSchema = TransicionaisIdSchema.nullable().catch(null);

// ocupado do dia por assistência (id ou supportTypeId). Item fora do formato fica de fora
const OccupiedSupportSchema = z
  .object({
    id: OptionalIdSchema,
    supportTypeId: OptionalIdSchema,
    occupied: z.number().int().min(0),
  })
  .transform((support) => ({ id: support.id ?? support.supportTypeId, occupied: support.occupied }));

// vagas do dia. O plano traz só groups (pessoas por grupo); o estoque é por assistência (E2.9),
// então só supports é lido (dúvida D36)
const DayVacanciesSchema = z.object({
  supports: z.array(OccupiedSupportSchema.nullable().catch(null)).catch([]),
});

const EMPTY_DAY_VACANCIES = { supports: [] };

const WebhookPersonSchema = z.object({
  guestId: OptionalIdSchema,
  email: z.string().refine((email) => email.trim() !== "").nullable().catch(null),
});

const EMPTY_PERSON = { guestId: null, email: null };

// os obrigatórios primeiro: a mensagem do 400 diz o primeiro campo recusado
const ValidationChangedDataSchema = z.object({
  configDayId: TransicionaisIdSchema,
  changedAt: DateSchema,
  answer: z.string(), // ATTENDING | DECLINED | TENTATIVE
  orderId: OptionalIdSchema,
  person: WebhookPersonSchema.catch(EMPTY_PERSON),
  groupId: OptionalIdSchema,
  supportTypeIds: z.array(OptionalIdSchema).catch([]),
  dayVacancies: DayVacanciesSchema.catch(EMPTY_DAY_VACANCIES), // ausente ou fora do formato: sem vagas
});

const ValidationChangedSchema = z.object({ data: ValidationChangedDataSchema });

type IDayVacancies = z.infer<typeof DayVacanciesSchema>;

// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class ValidationChangedResponse {
  // corpo inválido -> InvalidParameterError (400, dúvida D38)
  static toDomain(body: unknown): IWebhookValidation {
    const { data } = parseInput(ValidationChangedSchema, body);
    // TENTATIVE (talvez) não ocupa vaga: no Hormônios é "não vou" (dúvida D37)
    const attending = data.answer === ValidationAnswer.Attending;

    return {
      orderId: data.orderId,
      dayKey: data.configDayId,
      guestId: data.person.guestId,
      email: data.person.email,
      answer: attending ? AttendanceAnswer.Going : AttendanceAnswer.NotGoing,
      groupId: attending ? data.groupId : null,
      supportTypeIds: attending ? data.supportTypeIds.filter((id) => id !== null) : [],
      changedAt: data.changedAt,
      occupied: ValidationChangedResponse.toOccupied(data.dayVacancies),
    };
  }

  // supportId -> ocupado; o formato por grupo (pessoas) não vira estoque (E2.9, dúvida D36)
  private static toOccupied(vacancies: IDayVacancies): Record<string, number> | null {
    const occupied: Record<string, number> = {};

    for (const support of vacancies.supports) {
      if (support?.id) {
        occupied[support.id] = support.occupied;
      }
    }

    return Object.keys(occupied).length > 0 ? occupied : null;
  }
}
