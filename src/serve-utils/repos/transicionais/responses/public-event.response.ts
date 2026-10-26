import { z } from "zod";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { createLogger } from "../../../lib/logger";
import type { IEventRef } from "../../../interfaces/transicionais";
import { CurrentEvent, Instrument, Accessory } from "../../../models/current-event";
import { CurrentEventSnapshot } from "../../../models/current-event-snapshot";
import { LoanCatalogKind } from "../../../models/loan-catalog";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const logger = createLogger("PublicEventResponse");

// configDays[].summary.supports: a assistência com a capacidade e quem a pediu no dia
const DaySupportSchema = z.object({
  id: TransicionaisIdSchema,
  title: z.string(),
  type: z.enum(LoanCatalogKind).optional().catch(undefined), // desconhecido ou ausente: fica de fora (D24)
  isActive: z.boolean(),
  capacity: z.number().int().nullable(), // null = sem limite
  rotativo: z.boolean(), // a capacidade conta, mas não bloqueia
  // quem disse "vou" no dia pedindo a assistência (membros + convidados): a ocupação do ensaio. O
  // occupied é outra conta (empréstimos ativos agora) e não serve para o estoque do dia (D47)
  confirmed: z.number().int(),
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
  // md5 do encontro: muda quando algum campo muda; é ele que diz se o retrato precisa ser gravado
  // (D48). O retrato do webhook não traz: null
  hash: z.string().min(1).nullable().catch(null),
  location: z.string().nullable().transform((location) => location ?? ""),
  groups: z.array(EventGroupSchema),
  configDays: z.array(ConfigDaySchema).nonempty(),
  public: z.object({ answerWindow: AnswerWindowSchema.optional() }), // só encontro Público
});

type IPublicEvent = z.infer<typeof PublicEventSchema>;
type IDaySupport = z.infer<typeof DaySupportSchema>;

export class PublicEventResponse {
  // vacanciesAt: quando as vagas foram lidas (D5: a hora da leitura)
  static toDomain(raw: unknown, ref: IEventRef, vacanciesAt: string, operation = "publicEvent"): CurrentEventSnapshot {
    const event = parseResponse(PublicEventSchema, raw, InfraSource.Transicionais, operation);

    return InvalidResponseError.guard(InfraSource.Transicionais, operation, () =>
      PublicEventResponse.toSnapshot(event, ref, vacanciesAt),
    );
  }

  private static toSnapshot(event: IPublicEvent, ref: IEventRef, vacanciesAt: string): CurrentEventSnapshot {
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
      PublicEventResponse.toInstruments(event, daySupports),
      PublicEventResponse.toAccessories(daySupports),
      ref.externalId,
      vacanciesAt,
    );

    return new CurrentEventSnapshot(ref.externalId, event.version, event.hash, vacanciesAt, current);
  }

  // um grupo por assistência type='instrumento', na ordem do Transicionais. O grupo é o primeiro de
  // groupIds que é grupo do encontro; sem nenhum, o instrumento fica de fora (D21). Todos ativos
  private static toInstruments(event: IPublicEvent, daySupports: IDaySupport[]): Instrument[] {
    const eventGroupIds = new Set(event.groups.map((group) => group.id));
    const instruments: Instrument[] = [];

    for (const support of daySupports.filter((item) => item.type === LoanCatalogKind.Instrument)) {
      const groupId = support.groupIds.find((id) => eventGroupIds.has(id));

      if (groupId === undefined) {
        logger.warn({ supportId: support.id }, "instrument support has no group of the event (D21)");
        continue;
      }

      // dois instrumentos no mesmo grupo: vale o primeiro (D25)
      if (instruments.some((instrument) => instrument.id === groupId)) {
        logger.warn({ supportId: support.id, groupId }, "instrument support repeats a group (D25)");
        continue;
      }

      instruments.push(
        new Instrument(
          groupId,
          support.title,
          support.capacity,
          true,
          Math.max(0, support.confirmed),
          support.id,
          support.rotativo,
        ),
      );
    }

    return instruments;
  }

  // os acessórios: assistências type='acessorio', com o grupo a que valem (groupIds vazio = todos)
  private static toAccessories(daySupports: IDaySupport[]): Accessory[] {
    return daySupports
      .filter((support) => support.type === LoanCatalogKind.Accessory)
      .map(
        (support) =>
          new Accessory(
            support.id,
            support.title,
            support.capacity,
            Math.max(0, support.confirmed),
            support.rotativo,
            support.groupIds,
          ),
      );
  }
}
