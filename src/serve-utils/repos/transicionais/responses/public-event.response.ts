import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { createLogger } from "../../../lib/logger";
import type { IEventRef } from "../../../interfaces/transicionais";
import { CurrentEvent, Group, Support } from "../../../models/current-event";
import { EventSnapshot } from "../../../models/event-snapshot";
import { SupportTypeKind } from "../../../models/support-type";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const logger = createLogger("PublicEventResponse");

// configDays[].summary.supports: a assistência com a capacidade e o ocupado do dia
const DaySupportSchema = z.object({
  id: TransicionaisIdSchema,
  title: z.string(),
  type: z.enum(SupportTypeKind).optional().catch(undefined), // desconhecido ou ausente: fica de fora (D24)
  isActive: z.boolean(),
  capacity: z.number().int().nullable(), // null = sem limite
  rotativo: z.boolean(), // a capacidade conta, mas não bloqueia
  occupied: z.number().int(), // em uso no dia (D19)
  groupIds: z.array(TransicionaisIdSchema), // vazio = vale para todos os grupos
});

const ConfigDaySchema = z.object({
  id: TransicionaisIdSchema.nullable(), // null = dia ainda não salvo
  current: z.string(), // YYYY-MM-DD
  startTime: z.string().nullable().transform((time) => (time ?? "").slice(0, 5)), // HH:mm; null = a definir
  summary: z.object({ supports: z.array(DaySupportSchema) }).default({ supports: [] }), // só no GET público
});

const AnswerWindowSchema = z.object({
  open: z.boolean(),
  closed: z.boolean(),
});

const EventGroupSchema = z.object({
  id: TransicionaisIdSchema,
});

// GET v2/community/organizations/{customId}/events/{externalId}?dayId= (contrato:
// docs/plans/transicionais/public-event-exemplo.json). Também o retrato do webhook event.updated
const PublicEventSchema = z.object({
  version: z.number().int(),
  location: z.string().nullable().transform((location) => location ?? ""),
  groups: z.array(EventGroupSchema),
  configDays: z.array(ConfigDaySchema).nonempty(),
  public: z.object({ answerWindow: AnswerWindowSchema.optional() }), // só encontro Público
});

type IPublicEvent = z.infer<typeof PublicEventSchema>;
type IDaySupport = z.infer<typeof DaySupportSchema>;

export class PublicEventResponse {
  // vacanciesAt: quando as vagas foram lidas (D5: a hora da leitura)
  static toDomain(raw: unknown, ref: IEventRef, vacanciesAt: string, operation = "publicEvent"): EventSnapshot {
    const event = parseResponse(PublicEventSchema, raw, InfraSource.Transicionais, operation);

    return InvalidResponseError.guard(InfraSource.Transicionais, operation, () =>
      PublicEventResponse.toSnapshot(event, ref, vacanciesAt),
    );
  }

  private static toSnapshot(event: IPublicEvent, ref: IEventRef, vacanciesAt: string): EventSnapshot {
    // o dia do retrato; sem ele, o primeiro do encontro
    const day = event.configDays.find((item) => item.id === ref.dayId) ?? event.configDays[0];
    // inativa saiu das novas associações (D24)
    const daySupports = day.summary.supports.filter((support) => support.isActive);
    const answerWindow = event.public.answerWindow;

    const current = new CurrentEvent(
      ref.dayId,
      day.current.slice(0, 10),
      day.startTime,
      event.location,
      Boolean(answerWindow?.open) && !answerWindow?.closed,
      "", // whatsappUrl é só do Hormônios: fica o gravado
      PublicEventResponse.toGroups(event, daySupports),
      PublicEventResponse.toSupports(daySupports),
      ref.externalId,
      vacanciesAt,
    );

    return new EventSnapshot(ref.externalId, event.version, vacanciesAt, current);
  }

  // um grupo por assistência type='instrumento', na ordem do Transicionais. O grupo é o primeiro de
  // groupIds que é grupo do encontro; sem nenhum, o instrumento fica de fora (D21). Todos ativos
  private static toGroups(event: IPublicEvent, daySupports: IDaySupport[]): Group[] {
    const eventGroupIds = new Set(event.groups.map((group) => group.id));
    const groups: Group[] = [];

    for (const support of daySupports.filter((item) => item.type === SupportTypeKind.Instrument)) {
      const groupId = support.groupIds.find((id) => eventGroupIds.has(id));

      if (groupId === undefined) {
        logger.warn({ supportId: support.id }, "instrument support has no group of the event (D21)");
        continue;
      }

      // dois instrumentos no mesmo grupo: vale o primeiro (D25)
      if (groups.some((group) => group.id === groupId)) {
        logger.warn({ supportId: support.id, groupId }, "instrument support repeats a group (D25)");
        continue;
      }

      groups.push(
        new Group(
          groupId,
          support.title,
          support.capacity,
          true,
          Math.max(0, support.occupied),
          support.id,
          support.rotativo,
        ),
      );
    }

    return groups;
  }

  // os acessórios: assistências type='acessorio', com o grupo a que valem (groupIds vazio = todos)
  private static toSupports(daySupports: IDaySupport[]): Support[] {
    return daySupports
      .filter((support) => support.type === SupportTypeKind.Accessory)
      .map(
        (support) =>
          new Support(
            support.id,
            support.title,
            support.capacity,
            Math.max(0, support.occupied),
            support.rotativo,
            support.groupIds,
          ),
      );
  }
}
