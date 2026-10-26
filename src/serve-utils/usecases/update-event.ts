import { z } from "zod";
import {
  AppError,
  InvalidParameterError,
  NotFoundError,
  StockBelowReservationsError,
  UpstreamUnavailableError,
} from "../errors/app-error";
import { InfraSource, InvalidResponseError, VersionConflictError } from "../errors/infra-error";
import { today } from "../lib/date";
import { createLogger } from "../lib/logger";
import type { AdminSummary } from "../models/admin-summary";
import type { Attendance } from "../models/attendance";
import { CurrentEvent } from "../models/current-event";
import type { EventDay } from "../models/event-day";
import { EventPublication } from "../models/event-publication";
import { GroupVacancy } from "../models/group-vacancy";
import { CountSchema, NonBlankSchema, validateSchema } from "../models/model-schema";
import type { ManagedEvent } from "../models/managed-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { IEventChanges, IEventRef, ITransicionaisRepo } from "../interfaces/transicionais";
import { AdminSummaryMapper } from "./mappers/admin-summary.mapper";
import { RefreshCurrentEventUsecase } from "./refresh-current-event";

const logger = createLogger("UpdateEventUsecase");

// estoque de uma assistência: o instrumentSupportId de um grupo ou o id de um acessório (E2.9)
export interface IUpdateEventStockInput {
  id: string;
  stockTotal: number;
}

interface ICapacityChange {
  supportId: string;
  capacity: number;
}

// parcial: só os campos enviados mudam
export interface IUpdateEventInput {
  date?: string;
  time?: string;
  location?: string;
  whatsappUrl?: string;
  bookingOpen?: boolean;
  stocks?: IUpdateEventStockInput[];
}

// parcial: só o que difere do retrato vai ao Transicionais
interface ITransicionaisChanges {
  location?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  bookingOpen?: boolean;
}

// reservas abertas/fechadas pelo prazo do convidado (dúvida D1)
const BOOKING_OPEN_DEADLINE_MINUTES = 0; // até o início do dia
// o máximo da API (30 dias antes do início): fecha enquanto o encontro estiver a até 30 dias (D1)
const BOOKING_CLOSED_DEADLINE_MINUTES = 43200;

// a publicação inteira, copiada da atual, aberta ou fechada (D1). As vagas dos grupos (pessoas por
// grupo) vão como estão, uma por grupo do encontro: o estoque é o capacity das assistências (E2.9).
// Usada também pelo "Encerrar ensaio", que cria o próximo fechado (D2)
export function buildPublication(event: ManagedEvent, open: boolean): EventPublication {
  const publication = event.publication;

  if (!publication) {
    throw new InvalidResponseError(InfraSource.Transicionais, "findEventDetails", `event ${event.id} is not public`);
  }

  return new EventPublication(
    publication.id,
    publication.visibility,
    publication.description,
    open ? null : publication.releaseAt,
    open ? null : publication.membersEarlyAt,
    open ? BOOKING_OPEN_DEADLINE_MINUTES : BOOKING_CLOSED_DEADLINE_MINUTES,
    publication.supportIds, // todas, instrumentos e acessórios
    publication.totalVacancies,
    event.groupIds.map(
      (groupId) =>
        new GroupVacancy(groupId, publication.groupVacancies.find((item) => item.groupId === groupId)?.total ?? null),
    ),
  );
}

// o Transicionais grava YYYY-MM-DD e HH:mm (o front já manda assim); vazio = não muda
const UpdateEventInputSchema = z.object({
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
  time: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
  location: z.string().optional(),
  whatsappUrl: z.string().optional(),
  bookingOpen: z.boolean().optional(),
  stocks: z
    .array(z.object({ id: NonBlankSchema, stockTotal: CountSchema }))
    .refine((stocks) => new Set(stocks.map((stock) => stock.id)).size === stocks.length, {
      message: "has a repeated id",
    })
    .optional(),
});

// o id de assistência no Transicionais é numérico
const CapacityChangeSchema = z.object({
  supportId: z.string().refine((id) => Number.isInteger(Number(id)) && Number(id) > 0),
  capacity: CountSchema,
});

// "Salvar ensaio" (E2.5): o whatsappUrl grava local; o resto vai para o Transicionais
export class UpdateEventUsecase {
  private readonly refreshCurrentEvent: RefreshCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.refreshCurrentEvent = new RefreshCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: IUpdateEventInput): Promise<AdminSummary> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IUpdateEventInput): Promise<AdminSummary> {
    this.validateInput(input);

    const event = await this.findSupabaseTransicionaisEvent(input);
    const attendances = await this.findSupabaseAttendances(event.dayKey);
    const updated = this.buildUpdatedEvent(event, input);
    const capacities = this.buildCapacityChanges(event, attendances, input.stocks ?? []);
    const changes = this.buildTransicionaisChanges(event, updated);

    for (const capacity of capacities) {
      await this.updateTransicionaisCapacity(capacity); // fora do ar: 503
    }

    if (changes) {
      await this.updateTransicionaisEvent(event, changes); // fora do ar: 503 e nada é gravado
    }

    if (updated.whatsappUrl !== event.whatsappUrl) {
      await this.hormoniosRepo.saveWhatsappUrl(updated.whatsappUrl);
    }

    if (changes || capacities.length > 0) {
      await this.refreshSupabaseEvent();
    }

    const saved = await this.hormoniosRepo.findCurrentEventOrFail();

    return AdminSummaryMapper.toView(saved, await this.findSupabaseAttendances(saved.dayKey));
  }

  private validateInput(input: IUpdateEventInput) {
    validateSchema(UpdateEventInputSchema, input);
  }

  // retrato local da fase 1: lê o Transicionais antes (e migra as reservas)
  private async findSupabaseTransicionaisEvent(input: IUpdateEventInput): Promise<CurrentEvent> {
    let event = await this.hormoniosRepo.findCurrentEventOrFail();

    if (!event.isFromTransicionais) {
      await this.refreshSupabaseEvent();
      event = await this.hormoniosRepo.findCurrentEventOrFail();
    }

    this.validateFromTransicionais(event);
    this.validateStocksExist(event, input.stocks ?? []);

    return event;
  }

  private validateFromTransicionais(event: CurrentEvent) {
    if (!event.isFromTransicionais) {
      throw new UpstreamUnavailableError("Transicionais event is not available");
    }
  }

  // o id é o instrumentSupportId de um grupo ou o id de um acessório; sem limite não se ajusta (D20)
  private validateStocksExist(event: CurrentEvent, stocks: IUpdateEventStockInput[]) {
    for (const stock of stocks) {
      const item = event.findStock(stock.id);

      if (!item) {
        throw new InvalidParameterError(`Field stocks has unknown id ${stock.id}`);
      }

      if (item.stockTotal === null) {
        throw new InvalidParameterError(`Field stocks has unlimited id ${stock.id}`);
      }
    }
  }

  private async findSupabaseAttendances(dayKey: string): Promise<Attendance[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }

  private buildUpdatedEvent(event: CurrentEvent, input: IUpdateEventInput): CurrentEvent {
    return new CurrentEvent(
      event.dayKey,
      input.date || event.date,
      input.time || event.time,
      input.location?.trim() ?? event.location,
      input.bookingOpen ?? event.bookingOpen,
      input.whatsappUrl?.trim() ?? event.whatsappUrl,
      event.groups, // o estoque vai por buildCapacityChanges
      event.supports,
      event.externalId,
      event.fetchedAt,
    );
  }

  // só as capacidades que mudaram; cada uma vai por updateSupportCapacity. O id é o instrumentSupportId
  // de um grupo ou o id de um acessório (validateStocksExist)
  private buildCapacityChanges(
    event: CurrentEvent,
    attendances: Attendance[],
    stocks: IUpdateEventStockInput[],
  ): ICapacityChange[] {
    const changes = stocks
      .filter((stock) => stock.stockTotal !== event.findStock(stock.id)?.stockTotal)
      .map((stock) => ({ supportId: stock.id, capacity: stock.stockTotal }));

    this.validateStockAboveReservations(event, attendances, changes);

    return changes;
  }

  // ocupado = a conta das vagas mostradas (taken do Transicionais + "vou" locais PENDING); rotativo pode
  // passar da capacidade; o resto não fica abaixo do ocupado (D29)
  private validateStockAboveReservations(event: CurrentEvent, attendances: Attendance[], changes: ICapacityChange[]) {
    const below = changes.find(
      (change) => event.findStock(change.supportId)?.isBelowReservations(change.capacity, attendances) ?? false,
    );

    if (below) {
      throw new StockBelowReservationsError(`Stock of ${below.supportId} is below its reservations`);
    }
  }

  // estoque da Produção (E2.9, D26): lê o catálogo da assistência e o grava inteiro, só com o capacity
  // trocado
  private async updateTransicionaisCapacity(change: ICapacityChange): Promise<void> {
    this.validateCapacityChange(change);

    const supportType = await this.transicionaisRepo.findSupportType(change.supportId);

    if (!supportType) {
      throw new NotFoundError("Support Not Found");
    }

    await this.transicionaisRepo.saveSupportType(supportType.withCapacity(change.capacity));
  }

  private validateCapacityChange(change: ICapacityChange) {
    validateSchema(CapacityChangeSchema, change);
  }

  // só o que mudou em relação ao retrato; null = nada vai ao Transicionais
  private buildTransicionaisChanges(event: CurrentEvent, updated: CurrentEvent): ITransicionaisChanges | null {
    const changes: ITransicionaisChanges = {};

    if (updated.location !== event.location) {
      changes.location = updated.location;
    }

    if (updated.date !== event.date) {
      changes.date = updated.date;
    }

    if (updated.time !== event.time) {
      changes.time = updated.time;
    }

    if (updated.bookingOpen !== event.bookingOpen) {
      changes.bookingOpen = updated.bookingOpen;
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  // a troca de data muda o dia no Transicionais: as reservas locais vão para o dia novo, PENDING
  private async updateTransicionaisEvent(event: CurrentEvent, changes: ITransicionaisChanges): Promise<void> {
    const dayId = await this.saveTransicionaisEvent({ externalId: event.externalId ?? "", dayId: event.dayKey }, changes);

    if (dayId === event.dayKey) {
      return;
    }

    // a releitura logo depois acha o dia novo (primeiro dia ativo de hoje em diante)
    await this.hormoniosRepo.moveAttendances({
      oldDayKey: event.dayKey,
      newDayKey: dayId,
      groupMap: Object.fromEntries(event.groups.map((group) => [group.id, group.id])),
    });
  }

  // EVENT_VERSION_CONFLICT: lê a version de novo e tenta uma vez mais
  private async saveTransicionaisEvent(ref: IEventRef, changes: ITransicionaisChanges): Promise<string> {
    try {
      return await this.applyTransicionaisChanges(ref, changes);
    } catch (error) {
      if (!(error instanceof VersionConflictError)) {
        throw error;
      }

      return this.applyTransicionaisChanges(ref, changes);
    }
  }

  // grava só o que difere; devolve o dia do encontro depois da escrita (muda quando a data muda, D7)
  private async applyTransicionaisChanges(ref: IEventRef, changes: ITransicionaisChanges): Promise<string> {
    const managed = await this.findTransicionaisManagedEvent(ref);
    const days = await this.transicionaisRepo.listDays(managed.id);
    const day = days.find((item) => item.id === ref.dayId);

    if (!day) {
      throw new NotFoundError("Current event day Not Found");
    }

    const newDate = changes.date !== undefined && changes.date !== day.date ? changes.date : null;
    const eventChanges = this.buildEventChanges(managed, changes, newDate);
    let version = managed.version;

    if (Object.keys(eventChanges).length > 0) {
      version = await this.transicionaisRepo.saveEvent(managed.id, version, eventChanges);
    }

    const startTime = changes.time ?? day.startTime;

    if (!newDate) {
      if (changes.time !== undefined) {
        await this.transicionaisRepo.saveDays(managed.id, version, [day.withStartTime(startTime)]);
      }

      return ref.dayId;
    }

    return this.moveTransicionaisDay(managed.id, version, days, day, newDate, startTime);
  }

  private async findTransicionaisManagedEvent(ref: IEventRef): Promise<ManagedEvent> {
    const managed = await this.transicionaisRepo.findManagedEvent(ref, today()); // o encontro atual está de hoje em diante

    if (!managed) {
      throw new NotFoundError("Current event Not Found");
    }

    return managed;
  }

  // local, intervalo (a data nova entra nele, D7) e abertura (D1)
  private buildEventChanges(managed: ManagedEvent, changes: ITransicionaisChanges, newDate: string | null): IEventChanges {
    const eventChanges: IEventChanges = {};

    if (changes.location !== undefined) {
      eventChanges.location = changes.location;
    }

    // o intervalo do encontro passa a cobrir o dia novo (o antigo é desativado, nunca apagado)
    if (newDate) {
      eventChanges.startDate = [managed.startDate, newDate].sort()[0];
      eventChanges.endDate = [managed.endDate, newDate].sort()[1];
    }

    if (changes.bookingOpen !== undefined) {
      eventChanges.publication = buildPublication(managed, changes.bookingOpen);
    }

    return eventChanges;
  }

  // troca de dia (D7): ativa o dia novo com o horário, desativa o antigo (as presenças ficam nele) e
  // devolve o id do dia novo, que nasce no salvamento
  private async moveTransicionaisDay(
    eventId: string,
    version: number,
    days: EventDay[],
    day: EventDay,
    newDate: string,
    startTime: string | null,
  ): Promise<string> {
    const target = days.find((item) => item.date === newDate)
      ?? (await this.transicionaisRepo.listDays(eventId)).find((item) => item.date === newDate);

    if (!target) {
      throw new InvalidResponseError(InfraSource.Transicionais, "listDays", `event ${eventId} has no day ${newDate}`);
    }

    await this.transicionaisRepo.saveDays(eventId, version, [
      target.activate(startTime, day.endTime),
      day.deactivate(),
    ]);

    const saved = (await this.transicionaisRepo.listDays(eventId)).find(
      (item) => item.date === newDate && item.active && item.id !== null,
    );

    if (!saved?.id) {
      throw new InvalidResponseError(InfraSource.Transicionais, "saveDays", `event ${eventId} did not save day ${newDate}`);
    }

    return saved.id;
  }

  private async refreshSupabaseEvent(): Promise<void> {
    const result = await this.refreshCurrentEvent.execute();

    if (!result.available) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }
  }
}
