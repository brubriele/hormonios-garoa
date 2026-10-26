import { z } from "zod";
import {
  AppError,
  InvalidParameterError,
  NotFoundError,
  StockBelowReservationsError,
  UpstreamUnavailableError,
} from "../../errors/app-error";
import { InfraSource, InvalidResponseError, VersionConflictError } from "../../errors/infra-error";
import { today } from "../../lib/date";
import { createLogger } from "../../lib/logger";
import type { CurrentEventSummary } from "../../models/current-event-summary";
import type { Booking } from "../../models/booking";
import { CurrentEvent } from "../../models/current-event";
import type { EventDay } from "../../models/event-day";
import { PublicationSettings } from "../../models/publication-settings";
import { GroupCapacity } from "../../models/group-capacity";
import { CountSchema, NonBlankSchema, validateSchema } from "../../models/model-schema";
import type { ManagedEvent } from "../../models/managed-event";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { IEventChanges, IEventRef, ITransicionaisRepo } from "../../interfaces/transicionais";
import { CurrentEventSummaryMapper } from "./mappers/current-event-summary.mapper";
import { ReceivingCurrentEventUsecase } from "../sync/receiving-current-event";

const logger = createLogger("UpdatingCurrentEventUsecase");

// estoque de uma assistência: o instrumentSupportId de um grupo ou o id de um acessório (E2.9)
export interface IUpdatingCurrentEventStockInput {
  id: string;
  stockTotal: number;
}

interface ICapacityChange {
  supportId: string;
  capacity: number;
}

// quantas capacidades foram ao Transicionais na hora e quantas ficaram na fila (D53)
interface ICapacitiesResult {
  sent: number;
  queued: number;
}

// parcial: só os campos enviados mudam
export interface IUpdatingCurrentEventInput {
  date?: string;
  time?: string;
  location?: string;
  whatsappUrl?: string;
  bookingOpen?: boolean;
  stocks?: IUpdatingCurrentEventStockInput[];
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
export function buildPublication(event: ManagedEvent, open: boolean): PublicationSettings {
  const publication = event.publication;

  if (!publication) {
    throw new InvalidResponseError(InfraSource.Transicionais, "findEventDetails", `event ${event.id} is not public`);
  }

  return new PublicationSettings(
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
        new GroupCapacity(groupId, publication.groupVacancies.find((item) => item.groupId === groupId)?.total ?? null),
    ),
  );
}

// o Transicionais grava YYYY-MM-DD e HH:mm (o front já manda assim); vazio = não muda
const UpdatingCurrentEventInputSchema = z.object({
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

// "Salvar ensaio" (E2.5): o whatsappUrl grava local; o resto vai para o Transicionais. Com ele fora, o
// estoque fica na fila do cron (D53). Com o encerramento pendente (o ensaio só existe no local), só o
// estoque e o whatsappUrl mudam (D51)
export class UpdatingCurrentEventUsecase {
  private readonly receivingCurrentEvent: ReceivingCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.receivingCurrentEvent = new ReceivingCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: IUpdatingCurrentEventInput): Promise<CurrentEventSummary> {
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

  private async _execute(input: IUpdatingCurrentEventInput): Promise<CurrentEventSummary> {
    this.validateInput(input);

    const local = (await this.hormoniosRepo.findOpenNextEvent()) !== null; // D51
    const event = await this.findSupabaseTransicionaisEvent(input, local);
    const bookings = await this.findSupabaseBookings(event.dayKey);
    const updated = this.buildUpdatedEvent(event, input);
    const capacities = this.buildCapacityChanges(event, bookings, input.stocks ?? []);
    const changes = this.buildTransicionaisChanges(event, updated);

    this.validateLocalChanges(local, changes);

    const result = await this.updateCapacities(event, capacities); // fora do ar: fila (D53)

    if (changes) {
      await this.updateTransicionaisEvent(event, changes); // fora do ar: 503 e nada é gravado
    }

    if (updated.whatsappUrl !== event.whatsappUrl) {
      await this.hormoniosRepo.saveWhatsappUrl(updated.whatsappUrl);
    }

    // estoque na fila: o Transicionais está fora, e o retrato já foi gravado com ele
    if (!local && (changes || (result.sent > 0 && result.queued === 0))) {
      await this.refreshSupabaseEvent();
    }

    const saved = await this.hormoniosRepo.findCurrentEventOrFail();

    return CurrentEventSummaryMapper.toView(saved, await this.findSupabaseBookings(saved.dayKey));
  }

  private validateInput(input: IUpdatingCurrentEventInput) {
    validateSchema(UpdatingCurrentEventInputSchema, input);
  }

  // retrato local da fase 1: lê o Transicionais antes (e migra as reservas). O do encerramento pendente
  // (local) é a verdade até o cron criá-lo lá (D51)
  private async findSupabaseTransicionaisEvent(input: IUpdatingCurrentEventInput, local: boolean): Promise<CurrentEvent> {
    let event = await this.hormoniosRepo.findCurrentEventOrFail();

    if (!event.isFromTransicionais && !local) {
      await this.refreshSupabaseEvent();
      event = await this.hormoniosRepo.findCurrentEventOrFail();
    }

    if (!local) {
      this.validateFromTransicionais(event);
    }

    this.validateStocksExist(event, input.stocks ?? []);

    return event;
  }

  private validateFromTransicionais(event: CurrentEvent) {
    if (!event.isFromTransicionais) {
      throw new UpstreamUnavailableError("Transicionais event is not available");
    }
  }

  // o id é o instrumentSupportId de um grupo ou o id de um acessório; sem limite não se ajusta (D20)
  private validateStocksExist(event: CurrentEvent, stocks: IUpdatingCurrentEventStockInput[]) {
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

  // o ensaio só no local não tem encontro no Transicionais para receber data, hora, local ou abertura
  private validateLocalChanges(local: boolean, changes: ITransicionaisChanges | null) {
    if (local && changes) {
      throw new UpstreamUnavailableError("Next event is not in Transicionais yet");
    }
  }

  private async findSupabaseBookings(dayKey: string): Promise<Booking[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }

  private buildUpdatedEvent(event: CurrentEvent, input: IUpdatingCurrentEventInput): CurrentEvent {
    return new CurrentEvent(
      event.dayKey,
      input.date || event.date,
      input.time || event.time,
      input.location?.trim() ?? event.location,
      input.bookingOpen ?? event.bookingOpen,
      input.whatsappUrl?.trim() ?? event.whatsappUrl,
      event.instruments, // o estoque vai por buildCapacityChanges
      event.accessories,
      event.externalId,
      event.fetchedAt,
    );
  }

  // só as capacidades que mudaram; cada uma vai por updateSupportCapacity. O id é o instrumentSupportId
  // de um grupo ou o id de um acessório (validateStocksExist)
  private buildCapacityChanges(
    event: CurrentEvent,
    bookings: Booking[],
    stocks: IUpdatingCurrentEventStockInput[],
  ): ICapacityChange[] {
    const changes = stocks
      .filter((stock) => stock.stockTotal !== event.findStock(stock.id)?.stockTotal)
      .map((stock) => ({ supportId: stock.id, capacity: stock.stockTotal }));

    this.validateStockAboveBookings(event, bookings, changes);

    return changes;
  }

  // ocupado = a conta das vagas mostradas (taken do Transicionais + "vou" locais PENDING); rotativo pode
  // passar da capacidade; o resto não fica abaixo do ocupado (D29)
  private validateStockAboveBookings(event: CurrentEvent, bookings: Booking[], changes: ICapacityChange[]) {
    const below = changes.find(
      (change) => event.findStock(change.supportId)?.isBelowBookings(change.capacity, bookings) ?? false,
    );

    if (below) {
      throw new StockBelowReservationsError(`Stock of ${below.supportId} is below its reservations`);
    }
  }

  // cada capacidade vai ao Transicionais na hora; fora do ar, ou com uma pendente da mesma assistência
  // (a ordem das mudanças vale), vai para a fila e o retrato já a mostra (D53)
  private async updateCapacities(event: CurrentEvent, capacities: ICapacityChange[]): Promise<ICapacitiesResult> {
    const pendingIds = new Set((await this.hormoniosRepo.listPendingCapacities()).map((pending) => pending.supportId));
    let current = event;
    const result: ICapacitiesResult = { sent: 0, queued: 0 };

    for (const capacity of capacities) {
      if (!pendingIds.has(capacity.supportId) && (await this.sendTransicionaisCapacity(capacity))) {
        current = current.withStock(capacity.supportId, capacity.capacity);
        result.sent += 1;
        continue;
      }

      current = await this.savePendingCapacity(current, capacity);
      result.queued += 1;
    }

    return result;
  }

  // true = foi; false = o Transicionais está fora
  private async sendTransicionaisCapacity(capacity: ICapacityChange): Promise<boolean> {
    try {
      await this.updateTransicionaisCapacity(capacity);
      return true;
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return false;
      }

      throw error;
    }
  }

  private async savePendingCapacity(event: CurrentEvent, capacity: ICapacityChange): Promise<CurrentEvent> {
    this.validateCapacityChange(capacity);

    const updated = event.withStock(capacity.supportId, capacity.capacity);

    logger.warn({ supportId: capacity.supportId }, "capacity queued for Transicionais (D53)");
    await this.hormoniosRepo.savePendingCapacity({ supportId: capacity.supportId, capacity: capacity.capacity, event: updated });

    return updated;
  }

  // estoque da Produção (E2.9, D26): lê o catálogo da assistência e o grava inteiro, só com o capacity
  // trocado
  private async updateTransicionaisCapacity(change: ICapacityChange): Promise<void> {
    this.validateCapacityChange(change);

    const loanCatalog = await this.transicionaisRepo.findLoanCatalog(change.supportId);

    if (!loanCatalog) {
      throw new NotFoundError("Support Not Found");
    }

    await this.transicionaisRepo.saveLoanCatalog(loanCatalog.withCapacity(change.capacity));
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
    await this.hormoniosRepo.moveBookings({
      oldDayKey: event.dayKey,
      newDayKey: dayId,
      groupMap: Object.fromEntries(event.instruments.map((instrument) => [instrument.id, instrument.id])),
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
    const result = await this.receivingCurrentEvent.execute();

    if (!result.available) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }
  }
}
