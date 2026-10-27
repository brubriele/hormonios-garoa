import { z } from "zod";
import type { Event } from "../../domain/Event";
import { SyncStatus } from "../../domain/SyncStatus";
import { Webhook, WebhookResult } from "../../domain/Webhook";
import { AppError, NotFoundError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { CreatingInternalEventUsecase } from "../event/CreatingInternalEventUsecase";
import { UpdatingInternalEventUsecase } from "../event/UpdatingInternalEventUsecase";

const logger = createLogger("EventWebhookUsecase");

const EventWebhookInputSchema = z.instanceof(Webhook);

export class EventWebhookUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: Webhook): Promise<WebhookResult> {
    try {
      return await this._execute(input);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: Webhook): Promise<WebhookResult> {
    const webhook = this.validateInput(input);

    try {
      return await this.receiveEvent(webhook);
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
      return new WebhookResult(SyncStatus.Rejected, false);
    }

    const current = await this.findInternalEvent(external);

    if (!current) {
      await this.createEvent(external);

      return new WebhookResult(SyncStatus.Synced, true);
    }

    const changed = this.isChanged(external, current);

    if (changed) {
      await this.updateEvent(external);
    }

    return new WebhookResult(SyncStatus.Synced, true);
  }

  private async findTransicionaisEvent(id: number | string): Promise<Event | null> {
    const externalId = String(id);

    try {
      return await this.transicionaisRepo.findEvent(externalId);
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

    return this.hormoniosRepository.findEventByIntegrationId(integrationId);
  }

  private isChanged(external: Event, current: Event): boolean {
    const hashChanged = external.metadata.syncHash !== current.metadata.syncHash;
    const newer = this.isNewer(external.metadata.syncedAt, current.metadata.syncedAt);

    return hashChanged && newer;
  }

  private isNewer(incoming: string | null, stored: string | null): boolean {
    if (stored === null) {
      return true;
    }

    if (incoming === null) {
      return false;
    }

    return Date.parse(incoming) > Date.parse(stored);
  }

  private async createEvent(external: Event): Promise<Event> {
    const usecase = new CreatingInternalEventUsecase(this.hormoniosRepository);

    return usecase.execute(external);
  }

  private async updateEvent(external: Event): Promise<void> {
    const usecase = new UpdatingInternalEventUsecase(this.hormoniosRepository);

    await usecase.execute(external);
  }
}
