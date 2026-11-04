import { z } from "zod";
import type { Event } from "../../domain/Event";
import { SyncStatus } from "../../domain/SyncStatus";
import { Webhook, WebhookResult } from "../../domain/Webhook";
import { AppError, NotFoundError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { CreatingInternalEventUsecase } from "../event/CreatingInternalEventUsecase";
import { FindingInternalEventUsecase } from "../event/FindingInternalEventUsecase";
import { UpdatingInternalEventUsecase } from "../event/UpdatingInternalEventUsecase";

const logger = createLogger("EventWebhookUsecase", LogContext.Sync);

const EventWebhookInputSchema = z.instanceof(Webhook);

export class EventWebhookUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: Webhook): Promise<WebhookResult> {
    try {
      const result = await this._execute(input);

      return result;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error);
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: Webhook): Promise<WebhookResult> {
    logger.track("receiving event webhook");

    const webhook = this.validateInput(input);

    try {
      const result = await this.receiveEvent(webhook);

      return result;
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return new WebhookResult(SyncStatus.Pending, false);
      }

      throw error;
    }
  }

  private validateInput(input: Webhook): Webhook {
    return validateSchema(EventWebhookInputSchema, input);
  }

  private async receiveEvent(webhook: Webhook): Promise<WebhookResult> {
    const external = await this.findTransicionaisEvent(webhook.id);

    if (!external) {
      logger.track("event not found in Transicionais");

      return new WebhookResult(SyncStatus.Rejected, false);
    }

    const current = await this.findInternalEvent(external);

    if (!current) {
      const created = await this.createEvent(external);

      logger.track("event created", { hormoniosEventId: created.id });

      return new WebhookResult(SyncStatus.Synced, true);
    }

    const changed = this.isChanged(external, current);

    if (!changed) {
      logger.track("event already processed", { hormoniosEventId: current.id });

      return new WebhookResult(SyncStatus.Synced, true);
    }

    await this.updateEvent(external);

    logger.track("event updated", { hormoniosEventId: current.id });

    return new WebhookResult(SyncStatus.Synced, true);
  }

  private async findTransicionaisEvent(id: number | string): Promise<Event | null> {
    const externalId = String(id);

    try {
      const external = await this.transicionaisRepo.findEvent(externalId);

      return external;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }

      throw error;
    }
  }

  private async findInternalEvent(external: Event): Promise<Event | null> {
    const integrationId = external.metadata.integrationId;

    if (integrationId === null) {
      return null;
    }

    return this.hormoniosRepository.findEvent({ integrationId });
  }

  private isChanged(external: Event, current: Event): boolean {
    const hashChanged = external.metadata.syncHash !== current.metadata.syncHash;
    const older = this.isOlder(external.metadata.version, current.metadata.version);

    return hashChanged && !older;
  }

  private isOlder(incoming: number | null, stored: number | null): boolean {
    if (stored === null) {
      return false;
    }

    if (incoming === null) {
      return true;
    }

    return incoming < stored;
  }

  private async createEvent(external: Event): Promise<Event> {
    const usecase = new CreatingInternalEventUsecase(this.hormoniosRepository, this.transicionaisRepo);

    return usecase.execute(external);
  }

  private async updateEvent(external: Event): Promise<void> {
    const creating = new CreatingInternalEventUsecase(this.hormoniosRepository, this.transicionaisRepo);
    const finding = new FindingInternalEventUsecase(this.hormoniosRepository, creating);
    const usecase = new UpdatingInternalEventUsecase(this.hormoniosRepository, this.transicionaisRepo, finding);

    await usecase.execute(external);
  }
}
