import { z } from "zod";
import type { Event } from "../../domain/Event";
import { ErrorCtx, IntegrationEntity, type IntegrationStatus, MAX_ITEMS_PER_JOB } from "../../domain/IntegrationStatus";
import { Job } from "../../domain/Job";
import { EventMapper } from "../../domain/mappers/EventMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import { AppError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { jobSummary } from "../../lib/job-summary";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { toErrorCtx } from "../../lib/upstream";

const logger = createLogger("EventJobUsecase", LogContext.Job);

const EventJobInputSchema = z.instanceof(Job);

export class EventJobUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: Job): Promise<Event[]> {
    try {
      const events = await this._execute(input);

      return events;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error);
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: Job): Promise<Event[]> {
    logger.track("event job started");

    this.validateInput(input);

    const now = new Date();
    const integrationStatuses = await this.findDueIntegrationStatus(now);
    const results = await Promise.all(integrationStatuses.map((integrationStatus) => this.syncEvent(integrationStatus, now)));
    const events = results.filter((event) => event !== null);
    const statuses = events.map((event) => event.metadata.sync);

    logger.track("event job finished", jobSummary(integrationStatuses.length, statuses));

    return events;
  }

  private validateInput(input: Job): Job {
    return validateSchema(EventJobInputSchema, input);
  }

  private async findDueIntegrationStatus(now: Date): Promise<IntegrationStatus[]> {
    return this.hormoniosRepository.findDueIntegrationStatus(IntegrationEntity.Event, SyncStatus.Pending, now, MAX_ITEMS_PER_JOB);
  }

  private async syncEvent(integrationStatus: IntegrationStatus, now: Date): Promise<Event | null> {
    try {
      const event = await this.hormoniosRepository.findEvent(integrationStatus.entityId);

      if (!event) {
        await this.saveNotFound(integrationStatus, now);
        logger.track("event job item", { hormoniosEventId: integrationStatus.entityId, status: SyncStatus.ManualRetry });

        return null;
      }

      const sent = await this.sendEvent(event, integrationStatus, now);

      logger.track("event job item", { hormoniosEventId: sent.id, status: sent.metadata.sync });

      return sent;
    } catch (error) {
      logger.error({ err: error, hormoniosEventId: integrationStatus.entityId }, "event job failed");

      return null;
    }
  }

  private async saveNotFound(integrationStatus: IntegrationStatus, now: Date): Promise<void> {
    const errorCtx = new ErrorCtx(0, null, null, "Event not found");
    const failed = integrationStatus.manualRetry(errorCtx, now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(failed);
  }

  private async sendEvent(event: Event, integrationStatus: IntegrationStatus, now: Date): Promise<Event> {
    if (event.metadata.integrationId !== null) {
      return this.sendUpdate(event, integrationStatus, now);
    }

    if (!event.date) {
      const errorCtx = new ErrorCtx(0, null, null, "Event date is not defined");
      const pending = integrationStatus.pending(errorCtx, now);

      return this.saveFailure(event, pending);
    }

    try {
      const external = await this.transicionaisRepo.createEvent(event);
      const saved = await this.saveSynced(event, external, integrationStatus, now);

      return saved;
    } catch (error) {
      const failed = this.toFailedStatus(integrationStatus, error, now);

      return this.saveFailure(event, failed);
    }
  }

  // spec-4 C4
  private async sendUpdate(event: Event, integrationStatus: IntegrationStatus, now: Date): Promise<Event> {
    try {
      const external = await this.transicionaisRepo.updateEvent(event);
      const saved = await this.saveSynced(event, external, integrationStatus, now);

      return saved;
    } catch (error) {
      const failed = this.toFailedStatus(integrationStatus, error, now);

      return this.saveFailure(event, failed);
    }
  }

  private toFailedStatus(integrationStatus: IntegrationStatus, error: unknown, now: Date): IntegrationStatus {
    const errorCtx = toErrorCtx(error);

    if (error instanceof UpstreamUnavailableError) {
      return integrationStatus.pending(errorCtx, now);
    }

    logger.error({ err: error, hormoniosEventId: integrationStatus.entityId }, "event rejected by Transicionais");

    return integrationStatus.manualRetry(errorCtx, now);
  }

  private async saveSynced(event: Event, external: Event, integrationStatus: IntegrationStatus, now: Date): Promise<Event> {
    const json = event.toJson();
    const externalMetadata = external.metadata.toJson();
    const metadata = { ...externalMetadata, sync: SyncStatus.Synced, syncError: null };
    const synced = EventMapper.fromData({ ...json, metadata });
    const status = integrationStatus.synced(now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(status);

    return this.hormoniosRepository.updateEvent(synced);
  }

  private async saveFailure(event: Event, integrationStatus: IntegrationStatus): Promise<Event> {
    const json = event.toJson();
    const errorCtx = integrationStatus.errorCtx;
    const syncError = errorCtx ? errorCtx.key ?? errorCtx.message : null;
    const metadata = { ...json.metadata, sync: integrationStatus.status, syncError };
    const failed = EventMapper.fromData({ ...json, metadata });

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(integrationStatus);

    return this.hormoniosRepository.updateEvent(failed);
  }
}
