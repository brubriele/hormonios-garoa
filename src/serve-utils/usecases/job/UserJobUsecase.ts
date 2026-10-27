import { z } from "zod";
import { ErrorCtx, IntegrationEntity, type IntegrationStatus, MAX_ITEMS_PER_JOB } from "../../domain/IntegrationStatus";
import { Job } from "../../domain/Job";
import { UserMapper } from "../../domain/mappers/UserMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import type { User } from "../../domain/User";
import { AppError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { toErrorCtx } from "../../lib/upstream";

const logger = createLogger("UserJobUsecase", LogContext.Job);

const UserJobInputSchema = z.instanceof(Job);

export class UserJobUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: Job): Promise<User[]> {
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

  private async _execute(input: Job): Promise<User[]> {
    logger.track("user job started");

    this.validateInput(input);

    const now = new Date();
    const integrationStatuses = await this.findDueIntegrationStatus(now);
    const users = await Promise.all(integrationStatuses.map((integrationStatus) => this.syncUser(integrationStatus, now)));

    return users.filter((user) => user !== null);
  }

  private validateInput(input: Job): Job {
    return validateSchema(UserJobInputSchema, input);
  }

  private async findDueIntegrationStatus(now: Date): Promise<IntegrationStatus[]> {
    return this.hormoniosRepository.findDueIntegrationStatus(IntegrationEntity.User, SyncStatus.Pending, now, MAX_ITEMS_PER_JOB);
  }

  private async syncUser(integrationStatus: IntegrationStatus, now: Date): Promise<User | null> {
    try {
      const user = await this.hormoniosRepository.findUser(integrationStatus.entityId);

      if (!user) {
        await this.saveNotFound(integrationStatus, now);

        return null;
      }

      return await this.sendUser(user, integrationStatus, now);
    } catch (error) {
      logger.error({ err: error, hormoniosUserId: integrationStatus.entityId }, "user job failed");

      return null;
    }
  }

  private async saveNotFound(integrationStatus: IntegrationStatus, now: Date): Promise<void> {
    const errorCtx = new ErrorCtx(0, null, null, "User not found");
    const failed = integrationStatus.manualRetry(errorCtx, now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(failed);
  }

  private async sendUser(user: User, integrationStatus: IntegrationStatus, now: Date): Promise<User> {
    try {
      const external = await this.transicionaisRepo.createUser(user);

      return await this.saveSynced(external, integrationStatus, now);
    } catch (error) {
      const failed = this.toFailedStatus(integrationStatus, error, now);

      return this.saveFailure(user, failed);
    }
  }

  private toFailedStatus(integrationStatus: IntegrationStatus, error: unknown, now: Date): IntegrationStatus {
    const errorCtx = toErrorCtx(error);

    if (error instanceof UpstreamUnavailableError) {
      return integrationStatus.pending(errorCtx, now);
    }

    logger.error({ err: error, hormoniosUserId: integrationStatus.entityId }, "user rejected by Transicionais");

    return integrationStatus.manualRetry(errorCtx, now);
  }

  private async saveSynced(external: User, integrationStatus: IntegrationStatus, now: Date): Promise<User> {
    const json = external.toJson();
    const syncedAt = now.toISOString();
    const metadata = { ...json.metadata, sync: SyncStatus.Synced, syncError: null, syncedAt };
    const synced = UserMapper.fromData({ ...json, metadata }, []);
    const status = integrationStatus.synced(now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(status);

    return this.hormoniosRepository.createOrUpdateUser(synced);
  }

  private async saveFailure(user: User, integrationStatus: IntegrationStatus): Promise<User> {
    const json = user.toJson();
    const errorCtx = integrationStatus.errorCtx;
    const syncError = errorCtx ? errorCtx.key ?? errorCtx.message : null;
    const metadata = { ...json.metadata, sync: integrationStatus.status, syncError };
    const failed = UserMapper.fromData({ ...json, metadata }, []);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(integrationStatus);

    return this.hormoniosRepository.createOrUpdateUser(failed);
  }
}
