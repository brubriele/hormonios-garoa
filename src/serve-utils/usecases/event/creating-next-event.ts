import { AppError, NextEventPendingError, NotFoundError, UpstreamUnavailableError } from "../../errors/app-error";
import { InfraSource, InvalidResponseError } from "../../errors/infra-error";
import { addDays } from "../../lib/date";
import { createLogger } from "../../lib/logger";
import type { CurrentEventSummary } from "../../models/current-event-summary";
import type { CurrentEvent } from "../../models/current-event";
import type { EventDay } from "../../models/event-day";
import type { EventSnapshot } from "../../models/event-snapshot";
import type { ManagedEvent } from "../../models/managed-event";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { IEventRef, ITransicionaisRepo } from "../../interfaces/transicionais";
import { CurrentEventSummaryMapper } from "./mappers/current-event-summary.mapper";
import { ReceivingCurrentEventUsecase } from "../sync/receiving-current-event";
import { buildPublication } from "./updating-current-event";

const logger = createLogger("CreatingNextEventUsecase");

// "Encerrar ensaio" (dúvida D2): o próximo é uma semana depois, com o local a definir
const NEXT_EVENT_DAYS = 7;
const NEXT_EVENT_LOCATION = "A definir";

// "Encerrar ensaio" (E2.5): cria o próximo encontro no Transicionais e grava o retrato dele. O antigo
// fica no Transicionais; o refresh segue o encontro do retrato (E2.7, revista). Com o Transicionais
// fora, o próximo nasce só no local e o cron o cria lá depois (D51)
export class CreatingNextEventUsecase {
  private readonly receivingCurrentEvent: ReceivingCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.receivingCurrentEvent = new ReceivingCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(): Promise<CurrentEventSummary> {
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

  // ordem: cria o próximo e grava o retrato dele (D2). As linhas antigas ficam com o dayKey anterior; o
  // WhatsApp continua o mesmo
  private async _execute(): Promise<CurrentEventSummary> {
    await this.validateNoOpenNextEvent();

    const event = await this.findSupabaseTransicionaisEvent();
    const date = addDays(event.date, NEXT_EVENT_DAYS);

    try {
      const ref: IEventRef = { externalId: event.externalId ?? "", dayId: event.dayKey };
      const current = await this.findTransicionaisManagedEvent(ref, event.date);

      await this.saveSupabaseSnapshot(await this.createTransicionaisEvent(current, ref, date));
    } catch (error) {
      if (!(error instanceof UpstreamUnavailableError)) {
        throw error;
      }

      await this.closeSupabaseEventLocally(event, date); // D51
    }

    const saved = await this.hormoniosRepo.findCurrentEventOrFail();

    return CurrentEventSummaryMapper.toView(saved, []); // ensaio novo: ainda sem presenças
  }

  // o encerramento anterior ainda só existe no local (D51)
  private async validateNoOpenNextEvent() {
    if (await this.hormoniosRepo.findOpenNextEvent()) {
      throw new NextEventPendingError("Previous next event is still pending");
    }
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

  // a data do retrato: o encontro atual termina nela ou depois
  private async findTransicionaisManagedEvent(ref: IEventRef, fromDate: string): Promise<ManagedEvent> {
    const managed = await this.transicionaisRepo.findManagedEvent(ref, fromDate);

    if (!managed) {
      throw new NotFoundError("Current event Not Found");
    }

    return managed;
  }

  // cria o encontro, o ciclo, os grupos, o dia e o público, copiando o atual, e devolve o retrato dele
  // (E2.5, D2). Falhou depois do POST: apaga o recém-criado e relança (dúvida D16)
  private async createTransicionaisEvent(current: ManagedEvent, ref: IEventRef, date: string): Promise<EventSnapshot> {
    this.validatePublic(current);

    const day = current.days.find((item) => item.id === ref.dayId) ?? this.findFirstDay(current);

    if (!day) {
      throw new InvalidResponseError(InfraSource.Transicionais, "findEventDetails", `event ${current.id} has no active day`);
    }

    const eventId = (await this.transicionaisRepo.createEvent({ name: current.name, location: NEXT_EVENT_LOCATION, date }))
      ?? (await this.findCreatedEventId(current.name, date));

    try {
      await this.fillTransicionaisEvent(eventId, current, day, date);

      return await this.findTransicionaisPublicEvent(await this.findCreatedRef(eventId, date));
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

  // o dia do retrato saiu: o primeiro dia ativo (e salvo) do encontro
  private findFirstDay(event: ManagedEvent): EventDay | null {
    const days = event.days
      .filter((day) => day.active && day.id !== null)
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

  // o retrato do novo: ele não é o primeiro da listagem enquanto o antigo estiver lá. Já foi criado: se a
  // leitura pública não o achar, é falha da fonte
  private async findTransicionaisPublicEvent(ref: IEventRef): Promise<EventSnapshot> {
    const snapshot = await this.transicionaisRepo.findPublicEvent(ref);

    if (!snapshot) {
      throw new InvalidResponseError(InfraSource.Transicionais, "publicEvent", `created event ${ref.externalId} Not Found`);
    }

    return snapshot;
  }

  // o estoque que ainda não foi ao Transicionais vai por cima (D53)
  private async saveSupabaseSnapshot(snapshot: EventSnapshot): Promise<void> {
    const pendings = await this.hormoniosRepo.listPendingCapacities();

    await this.hormoniosRepo.saveSnapshot(snapshot.withPendingCapacities(pendings));
  }

  // o próximo só no local, num dia local, e o NEXT_EVENT na fila do cron (D51). Se o POST chegou a
  // criar o encontro e o delete não passou, ele fica Interno lá (D16)
  private async closeSupabaseEventLocally(event: CurrentEvent, date: string): Promise<void> {
    logger.warn({ externalId: event.externalId, date }, "Transicionais is unavailable, next event created locally (D51)");

    await this.hormoniosRepo.closeEventLocally({
      event: event.next(globalThis.crypto.randomUUID(), date, NEXT_EVENT_LOCATION),
      fromExternalId: event.externalId ?? "",
      fromDayKey: event.dayKey,
      fromDate: event.date,
    });
  }

  private async refreshSupabaseEvent(): Promise<void> {
    const result = await this.receivingCurrentEvent.execute();

    if (!result.available) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }
  }
}
