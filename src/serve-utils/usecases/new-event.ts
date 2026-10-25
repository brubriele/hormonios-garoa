import { AppError, NotFoundError, UpstreamUnavailableError } from "../errors/app-error";
import { InfraSource, InvalidResponseError } from "../errors/infra-error";
import { addDays, today } from "../lib/date";
import { createLogger } from "../lib/logger";
import type { AdminSummary } from "../models/admin-summary";
import type { CurrentEvent } from "../models/current-event";
import type { EventDay } from "../models/event-day";
import type { ManagedEvent } from "../models/managed-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { IEventRef, ITransicionaisRepo } from "../interfaces/transicionais";
import { AdminSummaryMapper } from "./mappers/admin-summary.mapper";
import { RefreshCurrentEventUsecase } from "./refresh-current-event";
import { buildPublication } from "./update-event";

const logger = createLogger("NewEventUsecase");

// "Encerrar ensaio" (dúvida D2): o próximo é uma semana depois, com o local a definir
const NEXT_EVENT_DAYS = 7;
const NEXT_EVENT_LOCATION = "A definir";

// "Encerrar ensaio" (E2.5): cria o próximo encontro no Transicionais, apaga o atual, e o novo passa a
// ser o primeiro Público da listagem (E2.7, revista)
export class NewEventUsecase {
  private readonly refreshCurrentEvent: RefreshCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.refreshCurrentEvent = new RefreshCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(): Promise<AdminSummary> {
    try {
      return await this._execute(); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // ordem: cria o próximo, encerra o antigo e relê; a releitura acha o novo pela listagem (D2).
  // as linhas antigas ficam com o dayKey anterior; o WhatsApp continua o mesmo
  private async _execute(): Promise<AdminSummary> {
    const event = await this.findSupabaseTransicionaisEvent();
    const ref: IEventRef = { externalId: event.externalId ?? "", dayId: event.dayKey };
    const current = await this.findTransicionaisManagedEvent(ref);
    await this.createTransicionaisEvent(current, ref);
    await this.closeTransicionaisEvent(current);
    await this.refreshSupabaseEvent();

    const saved = await this.hormoniosRepo.findCurrentEventOrFail();

    return AdminSummaryMapper.toView(saved, []); // ensaio novo: ainda sem presenças
  }

  // retrato local da fase 1: lê o Transicionais antes (e migra as reservas)
  private async findSupabaseTransicionaisEvent(): Promise<CurrentEvent> {
    const event = await this.hormoniosRepo.findCurrentEventOrFail();

    if (event.isFromTransicionais) {
      return event;
    }

    await this.refreshSupabaseEvent();

    const refreshed = await this.hormoniosRepo.findCurrentEventOrFail();

    if (!refreshed.isFromTransicionais) {
      throw new UpstreamUnavailableError("Transicionais event is not available");
    }

    return refreshed;
  }

  private async findTransicionaisManagedEvent(ref: IEventRef): Promise<ManagedEvent> {
    const managed = await this.transicionaisRepo.findManagedEvent(ref, today()); // o encontro atual está de hoje em diante

    if (!managed) {
      throw new NotFoundError("Current event Not Found");
    }

    return managed;
  }

  // cria o encontro, o ciclo, os grupos, o dia e o público, copiando o atual (E2.5, D2). Falhou depois
  // do POST: apaga o recém-criado e relança (dúvida D16)
  private async createTransicionaisEvent(current: ManagedEvent, ref: IEventRef): Promise<IEventRef> {
    this.validatePublic(current);

    const day = current.days.find((item) => item.id === ref.dayId) ?? this.findCurrentDay(current);

    if (!day) {
      throw new InvalidResponseError(InfraSource.Transicionais, "findEventDetails", `event ${current.id} has no active day`);
    }

    const date = addDays(day.date, NEXT_EVENT_DAYS);
    const eventId = (await this.transicionaisRepo.createEvent({ name: current.name, location: NEXT_EVENT_LOCATION, date }))
      ?? (await this.findCreatedEventId(current.name, date));

    try {
      await this.fillTransicionaisEvent(eventId, current, day, date);

      return await this.findCreatedRef(eventId, date);
    } catch (error) {
      await this.deleteCreatedEvent(eventId);
      throw error;
    }
  }

  private validatePublic(event: ManagedEvent) {
    if (!event.publication) {
      throw new InvalidResponseError(InfraSource.Transicionais, "findEventDetails", `event ${event.id} is not public`);
    }
  }

  // o primeiro dia ativo (e salvo) de hoje em diante
  private findCurrentDay(event: ManagedEvent): EventDay | null {
    const from = today();
    const days = event.days
      .filter((day) => day.active && day.id !== null && day.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date));

    return days[0] ?? null;
  }

  // o POST não trouxe o id: é o maior id Interno com o mesmo nome e dia (D18)
  private async findCreatedEventId(name: string, date: string): Promise<string> {
    const created = (await this.transicionaisRepo.listEventsFrom(date))
      .filter((item) => item.name === name && item.date === date && item.externalId === null)
      .sort((a, b) => Number(b.id) - Number(a.id))[0];

    if (!created) {
      throw new InvalidResponseError(InfraSource.Transicionais, "createEvent", `created event ${date} Not Found`);
    }

    return created.id;
  }

  private async fillTransicionaisEvent(eventId: string, current: ManagedEvent, day: EventDay, date: string): Promise<void> {
    let fresh = await this.transicionaisRepo.findManagedEventById(eventId);

    // o POST não grava o ciclo (o encontro 202 nasceu com o ciclo 1): vai pela rota própria (D16)
    if (current.categoryId !== null && fresh.categoryId !== current.categoryId) {
      await this.transicionaisRepo.setCategory(eventId, current.categoryId);
      fresh = await this.transicionaisRepo.findManagedEventById(eventId);
    }

    let version = fresh.version;

    if (current.groupIds.length > 0) {
      version = await this.transicionaisRepo.addGroups(eventId, { groupIds: current.groupIds, createdAt: fresh.createdAt });
    }

    const newDay = (await this.transicionaisRepo.listDays(eventId)).find((item) => item.date === date);

    if (!newDay) {
      throw new InvalidResponseError(InfraSource.Transicionais, "listDays", `event ${eventId} has no day ${date}`);
    }

    version = await this.transicionaisRepo.saveDays(eventId, version, [
      newDay.activate(day.startTime, day.endTime),
    ]);

    // a mesma visibilidade, assistências e limites, fechado (D2)
    await this.transicionaisRepo.saveEvent(eventId, version, { publication: buildPublication(current, false) });
  }

  // o link público do encontro é o id da publicação (dúvida D6)
  private async findCreatedRef(eventId: string, date: string): Promise<IEventRef> {
    const created = await this.transicionaisRepo.findManagedEventById(eventId);

    this.validatePublic(created);

    const day = created.days.find((item) => item.date === date);

    if (!created.publication || !day?.id) {
      throw new InvalidResponseError(InfraSource.Transicionais, "findEventDetails", `event ${eventId} has no active day ${date}`);
    }

    return { externalId: created.publication.id, dayId: day.id };
  }

  // não deixa lixo no Transicionais; se nem o delete passar, só registra (D16)
  private async deleteCreatedEvent(eventId: string): Promise<void> {
    try {
      await this.transicionaisRepo.deleteEvent(eventId);
    } catch (error) {
      logger.error({ err: error, eventId }, "could not delete the created event (D16)");
    }
  }

  // o novo já é o atual: se o antigo não sair, só registra e segue (dúvida D13). Por enquanto, apaga o
  // encontro (as presenças ficam guardadas no Transicionais); quando houver o "encerrar" no
  // Transicionais, troca só aqui
  private async closeTransicionaisEvent(current: ManagedEvent): Promise<void> {
    try {
      await this.transicionaisRepo.deleteEvent(current.id);
    } catch (error) {
      logger.error({ err: error }, "could not close the old Transicionais event (D13)");
    }
  }

  private async refreshSupabaseEvent(): Promise<void> {
    const result = await this.refreshCurrentEvent.execute();

    if (!result.available) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }
  }
}
