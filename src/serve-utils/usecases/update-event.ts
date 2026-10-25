import {
  AppError,
  InvalidParameterError,
  StockBelowReservationsError,
  UpstreamUnavailableError,
} from "../errors/app-error";
import type { Attendance } from "../models/attendance";
import { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { ITransicionaisRepo, IUpdateTransicionaisEventData } from "../interfaces/transicionais";
import { countTakenByGroup, countTakenBySupport, toAdminSummary, type IAdminSummary } from "./event-summary";
import { RefreshCurrentEventUsecase } from "./refresh-current-event";

// estoque de uma assistência: o instrumentSupportId de um grupo ou o id de um acessório (E2.9)
export interface IUpdateEventStockInput {
  id: string;
  stockTotal: number;
}

// assistência ajustável, com a conta das vagas mostradas
interface IStockItem {
  stockTotal: number | null;
  rotativo: boolean;
  taken: number;
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

const TEXT_FIELDS = ["date", "time", "location", "whatsappUrl"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

// "Salvar ensaio" (E2.5): o whatsappUrl grava local; o resto vai para o Transicionais
export class UpdateEventUsecase {
  private readonly refreshCurrentEvent: RefreshCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.refreshCurrentEvent = new RefreshCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: IUpdateEventInput): Promise<IAdminSummary> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[UpdateEventUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IUpdateEventInput): Promise<IAdminSummary> {
    this.validateInput(input);

    const event = await this.findSupabaseTransicionaisEvent(input);
    const attendances = await this.findSupabaseAttendances(event.dayKey);
    const updated = this.buildUpdatedEvent(event, input);
    const capacities = this.buildCapacityChanges(event, attendances, input.stocks ?? []);
    const changes = this.buildTransicionaisChanges(event, updated);

    for (const capacity of capacities) {
      await this.transicionaisRepo.updateSupportCapacity(capacity.supportId, capacity.capacity); // fora do ar: 503
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

    return toAdminSummary(saved, await this.findSupabaseAttendances(saved.dayKey));
  }

  private validateInput(input: IUpdateEventInput) {
    for (const field of TEXT_FIELDS) {
      if (input[field] !== undefined && typeof input[field] !== "string") {
        throw new InvalidParameterError(`Field ${field} is invalid`);
      }
    }

    // o Transicionais grava YYYY-MM-DD e HH:mm (o front já manda assim); vazio = não muda
    if (input.date && !DATE_PATTERN.test(input.date)) {
      throw new InvalidParameterError("Field date is invalid");
    }

    if (input.time && !TIME_PATTERN.test(input.time)) {
      throw new InvalidParameterError("Field time is invalid");
    }

    if (input.bookingOpen !== undefined && typeof input.bookingOpen !== "boolean") {
      throw new InvalidParameterError("Field bookingOpen is invalid");
    }

    if (input.stocks === undefined) {
      return;
    }

    if (!Array.isArray(input.stocks)) {
      throw new InvalidParameterError("Field stocks is invalid");
    }

    for (const stock of input.stocks) {
      if (
        typeof stock?.id !== "string"
        || stock.id.trim() === ""
        || !Number.isInteger(stock.stockTotal)
        || stock.stockTotal < 0
      ) {
        throw new InvalidParameterError("Field stocks is invalid");
      }
    }

    if (new Set(input.stocks.map((stock) => stock.id)).size !== input.stocks.length) {
      throw new InvalidParameterError("Field stocks has a repeated id");
    }
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
    const items = this.buildStockItems(event, []);

    for (const stock of stocks) {
      const item = items.get(stock.id);

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

  // instrumentos (pelo instrumentSupportId do grupo) e acessórios, por supportId.
  // taken = a conta das vagas mostradas (taken do Transicionais + "vou" locais PENDING)
  private buildStockItems(event: CurrentEvent, attendances: Attendance[]): Map<string, IStockItem> {
    const takenByGroup = countTakenByGroup(event, attendances);
    const takenBySupport = countTakenBySupport(event, attendances);
    const items = new Map<string, IStockItem>();

    for (const group of event.groups) {
      if (group.instrumentSupportId !== null) {
        items.set(group.instrumentSupportId, {
          stockTotal: group.stockTotal,
          rotativo: group.rotativo,
          taken: takenByGroup.get(group.id) ?? 0,
        });
      }
    }

    for (const support of event.supports) {
      items.set(support.id, {
        stockTotal: support.stockTotal,
        rotativo: support.rotativo,
        taken: takenBySupport.get(support.id) ?? 0,
      });
    }

    return items;
  }

  // só as capacidades que mudaram; cada uma vai por updateSupportCapacity
  private buildCapacityChanges(
    event: CurrentEvent,
    attendances: Attendance[],
    stocks: IUpdateEventStockInput[],
  ): ICapacityChange[] {
    const items = this.buildStockItems(event, attendances);
    const changes = stocks
      .filter((stock) => stock.stockTotal !== items.get(stock.id)?.stockTotal)
      .map((stock) => ({ supportId: stock.id, capacity: stock.stockTotal }));

    this.validateStockAboveReservations(items, changes);

    return changes;
  }

  // rotativo pode passar da capacidade; o resto não fica abaixo do ocupado (D29)
  private validateStockAboveReservations(items: Map<string, IStockItem>, changes: ICapacityChange[]) {
    const below = changes.find((change) => {
      const item = items.get(change.supportId);

      return item !== undefined && !item.rotativo && change.capacity < item.taken;
    });

    if (below) {
      throw new StockBelowReservationsError(`Stock of ${below.supportId} is below its reservations`);
    }
  }

  // só o que mudou em relação ao retrato; null = nada vai ao Transicionais
  private buildTransicionaisChanges(event: CurrentEvent, updated: CurrentEvent): IUpdateTransicionaisEventData | null {
    const changes: IUpdateTransicionaisEventData = {};

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
  private async updateTransicionaisEvent(event: CurrentEvent, changes: IUpdateTransicionaisEventData): Promise<void> {
    const ref = await this.transicionaisRepo.updateEvent(
      { externalId: event.externalId ?? "", dayId: event.dayKey },
      changes,
    );

    if (ref.dayId === event.dayKey) {
      return;
    }

    // a releitura logo depois acha o dia novo (primeiro dia ativo de hoje em diante)
    await this.hormoniosRepo.moveAttendances({
      oldDayKey: event.dayKey,
      newDayKey: ref.dayId,
      groupMap: Object.fromEntries(event.groups.map((group) => [group.id, group.id])),
    });
  }

  private async refreshSupabaseEvent(): Promise<void> {
    const result = await this.refreshCurrentEvent.execute();

    if (!result.available) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }
  }
}
