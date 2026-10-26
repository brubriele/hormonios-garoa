import { AppError, NotFoundError, UpstreamUnavailableError } from "../../errors/app-error";
import { InfraSource, InvalidResponseError, UpstreamBadContractError, UpstreamResponseError } from "../../errors/infra-error";
import { createLogger } from "../../lib/logger";
import type { EventDay } from "../../models/event-day";
import type { CurrentEventSnapshot } from "../../models/current-event-snapshot";
import type { ManagedEvent } from "../../models/managed-event";
import type { PendingEventCreation } from "../../models/pending-event-creation";
import { PendingSyncMode } from "../../models/pending-sync";
import type { IHormoniosRepo, IMarkPendingSyncData } from "../../interfaces/hormonios";
import type { IEventRef, ITransicionaisRepo } from "../../interfaces/transicionais";
import { buildPublication } from "../event/updating-current-event";

const logger = createLogger("SyncingNextEventPendingUsecase");

// um encerramento aberto por vez (encerrar_local, D51)
const CLAIM_LIMIT = 1;

export interface ISyncingNextEventPendingResult {
  claimed: number;
  synced: number;
  rejected: number;
  pending: number; // continua PENDING: o cron tenta de novo mais tarde
  manualRetry: number; // 400, 409 ou 422: fora do cron até o ajuste manual (D50)
}

// "Encerrar ensaio" (dúvida D2): o local a definir
const NEXT_EVENT_LOCATION = "A definir";

// o "Encerrar" que ficou na fila (D51): tenta criar o próximo encontro no Transicionais. Conseguiu: grava
// o retrato dele e entrega o resto às filas certas, sem enviar nada: as reservas do dia local recebem o
// dia de lá e ficam PENDING (fila de booking); o estoque é da assistência e já está na fila de stock.
// GET /api/cron/sync?type=nextEvent
export class SyncingNextEventPendingUsecase {
  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(): Promise<ISyncingNextEventPendingResult> {
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

  // claimed 0 = nenhum na fila (ou ainda esperando a próxima tentativa)
  private async _execute(): Promise<ISyncingNextEventPendingResult> {
    const pendings = await this.claimSupabasePendingNextEvents();
    const modes: PendingSyncMode[] = [];

    for (const pending of pendings) {
      const mark = await this.syncTransicionaisNextEvent(pending);

      await this.hormoniosRepo.markPendingSync(mark);
      modes.push(mark.mode);
    }

    return this.countModes(modes);
  }

  private async claimSupabasePendingNextEvents(): Promise<PendingEventCreation[]> {
    return this.hormoniosRepo.claimPendingNextEvents({ limit: CLAIM_LIMIT });
  }

  // o encerrado sumiu da listagem: MANUAL_RETRY
  private async syncTransicionaisNextEvent(pending: PendingEventCreation): Promise<IMarkPendingSyncData> {
    try {
      const from: IEventRef = { externalId: pending.fromExternalId, dayId: pending.fromDayKey };
      const current = await this.findTransicionaisManagedEvent(from, pending.fromDate);
      const snapshot = await this.createTransicionaisEvent(current, from, pending.date);

      await this.saveSupabaseSnapshot(snapshot);
      await this.queueSupabaseBookings(pending, snapshot);

      return this.buildMark(pending, PendingSyncMode.Synced);
    } catch (error) {
      if (error instanceof NotFoundError) {
        logger.error({ fromExternalId: pending.fromExternalId }, "closed event not found, next event needs a manual retry (D51)");
        return this.buildMark(pending, PendingSyncMode.ManualRetry);
      }

      return this.buildFailedMark(error, pending);
    }
  }

  // acha o encerrado na listagem a partir da data dele, mesmo depois do dia passar
  private async findTransicionaisManagedEvent(ref: IEventRef, fromDate: string): Promise<ManagedEvent> {
    const managed = await this.transicionaisRepo.findManagedEvent(ref, fromDate);

    if (!managed) {
      throw new NotFoundError("Current event Not Found");
    }

    return managed;
  }

  // cria o encontro, o ciclo, os grupos, o dia e o público, copiando o encerrado, e devolve o retrato dele
  // (E2.5, D2). Falhou depois do POST: apaga o recém-criado e relança (dúvida D16)
  private async createTransicionaisEvent(current: ManagedEvent, ref: IEventRef, date: string): Promise<CurrentEventSnapshot> {
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

  // o dia do encerrado saiu: o primeiro dia ativo (e salvo) dele
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

  // já foi criado: se a leitura pública não o achar, é falha da fonte
  private async findTransicionaisPublicEvent(ref: IEventRef): Promise<CurrentEventSnapshot> {
    const snapshot = await this.transicionaisRepo.findPublicEvent(ref);

    if (!snapshot) {
      throw new InvalidResponseError(InfraSource.Transicionais, "publicEvent", `created event ${ref.externalId} Not Found`);
    }

    return snapshot;
  }

  // o retrato do novo, com o estoque que ainda está na fila de stock por cima (D53)
  private async saveSupabaseSnapshot(snapshot: CurrentEventSnapshot): Promise<void> {
    const capacities = await this.hormoniosRepo.listPendingCapacities();

    await this.hormoniosRepo.saveSnapshot(snapshot.withPendingCapacities(capacities));
  }

  // as reservas do dia local vão para o dia de lá como PENDING: a fila de booking as envia
  private async queueSupabaseBookings(pending: PendingEventCreation, snapshot: CurrentEventSnapshot): Promise<void> {
    await this.hormoniosRepo.moveBookings({
      oldDayKey: pending.dayKey,
      newDayKey: snapshot.event.dayKey,
      groupMap: Object.fromEntries(snapshot.event.instruments.map((instrument) => [instrument.id, instrument.id])),
    });
  }

  private buildMark(pending: PendingEventCreation, mode: PendingSyncMode): IMarkPendingSyncData {
    return { id: pending.id, updatedAt: pending.updatedAt, mode, error: null, errorCause: null };
  }

  // fora do ar ou outra falha: PENDING com espera. 400, 409 ou 422: MANUAL_RETRY. O erro do Transicionais
  // é gravado como veio (D50)
  private buildFailedMark(error: unknown, pending: PendingEventCreation): IMarkPendingSyncData {
    if (error instanceof UpstreamBadContractError) {
      logger.error({ writeId: pending.id, errorCause: error.errorCause }, "next event needs a manual retry (D50)");
      return { ...this.buildMark(pending, PendingSyncMode.ManualRetry), errorCause: error.errorCause };
    }

    if (error instanceof UpstreamUnavailableError) {
      return this.buildMark(pending, PendingSyncMode.Backoff);
    }

    logger.error({ err: error, writeId: pending.id }, "next event not sent");
    const errorCause = error instanceof UpstreamResponseError ? error.errorCause : null;

    return { ...this.buildMark(pending, PendingSyncMode.Backoff), errorCause };
  }

  private countModes(modes: PendingSyncMode[]): ISyncingNextEventPendingResult {
    return {
      claimed: modes.length,
      synced: modes.filter((mode) => mode === PendingSyncMode.Synced).length,
      rejected: modes.filter((mode) => mode === PendingSyncMode.Rejected).length,
      pending: modes.filter((mode) => mode === PendingSyncMode.Backoff).length,
      manualRetry: modes.filter((mode) => mode === PendingSyncMode.ManualRetry).length,
    };
  }
}
