import { z } from "zod";
import { UserMapper } from "../../domain/mappers/UserMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import type { User } from "../../domain/User";
import { Webhook, WebhookResult } from "../../domain/Webhook";
import { AppError, NotFoundError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { CreatingOrUpdateUserUsecase } from "../booking/CreatingOrUpdateUserUsecase";

const logger = createLogger("UserWebhookUsecase", LogContext.Sync);

const UserWebhookInputSchema = z.instanceof(Webhook);

export class UserWebhookUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: Webhook): Promise<WebhookResult> {
    try {
      return await this._execute(input);
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
    logger.track("receiving user webhook");

    const webhook = this.validateInput(input);

    try {
      return await this.receiveUser(webhook);
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return new WebhookResult(SyncStatus.Pending, false);
      }

      throw error;
    }
  }

  private validateInput(input: Webhook): Webhook {
    return validateSchema(UserWebhookInputSchema, input);
  }

  private async receiveUser(webhook: Webhook): Promise<WebhookResult> {
    const external = await this.findTransicionaisUser(webhook.id);

    if (!external) {
      return new WebhookResult(SyncStatus.Rejected, false);
    }

    const current = await this.findInternalUser(external);

    if (!current && !external.email) {
      return new WebhookResult(SyncStatus.Rejected, false);
    }

    if (!current) {
      await this.createOrUpdateUser(external);

      return new WebhookResult(SyncStatus.Synced, true);
    }

    const linked = this.linkUser(external, current);

    await this.createOrUpdateUser(linked);

    return new WebhookResult(SyncStatus.Synced, true);
  }

  private async findTransicionaisUser(id: number | string): Promise<User | null> {
    const externalId = String(id);

    try {
      return await this.transicionaisRepo.findUser(externalId);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }

      throw error;
    }
  }

  private async findInternalUser(external: User): Promise<User | null> {
    const integrationId = external.metadata.integrationId;

    if (integrationId) {
      const byIntegrationId = await this.hormoniosRepository.findUserByIntegrationId(integrationId);

      if (byIntegrationId) {
        return byIntegrationId;
      }
    }

    if (!external.email) {
      return null;
    }

    return this.hormoniosRepository.findUserByEmail(external.email);
  }

  private linkUser(external: User, current: User): User {
    const json = current.toJson();
    const externalMetadata = external.toJson().metadata;
    const integrationId = json.metadata.integrationId ?? externalMetadata.integrationId;
    const metadata = { ...json.metadata, integrationId, account: externalMetadata.account };

    return UserMapper.fromData({ ...json, metadata }, []);
  }

  private async createOrUpdateUser(user: User): Promise<User> {
    const usecase = new CreatingOrUpdateUserUsecase(this.hormoniosRepository, this.transicionaisRepo);

    return usecase.execute(user);
  }
}
