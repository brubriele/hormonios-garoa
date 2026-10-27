import { z } from "zod";
import { IntegrationEntity, IntegrationStatus } from "../../domain/IntegrationStatus";
import { UserMapper } from "../../domain/mappers/UserMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import { User } from "../../domain/User";
import { AppError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { toErrorCtx } from "../../lib/upstream";

const logger = createLogger("CreatingOrUpdateUserUsecase");

const CreatingOrUpdateUserInputSchema = z.instanceof(User);

export class CreatingOrUpdateUserUsecase {
  constructor(
    private readonly hormoniosRepository: IHormoniosRepository,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(user: User): Promise<User> {
    try {
      return await this._execute(user);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(user: User): Promise<User> {
    const valid = this.validateInput(user);
    const withoutAttendances = this.withoutAttendances(valid);
    const saved = await this.createOrUpdateUser(withoutAttendances);

    return this.sync(saved);
  }

  private validateInput(user: User): User {
    return validateSchema(CreatingOrUpdateUserInputSchema, user);
  }

  private withoutAttendances(user: User): User {
    const data = user.toJson();

    return UserMapper.fromData(data, []);
  }

  private async createOrUpdateUser(user: User): Promise<User> {
    return this.hormoniosRepository.createOrUpdateUser(user);
  }

  private async sync(user: User): Promise<User> {
    const shouldSync = this.shouldSync(user);

    if (!shouldSync) {
      return user;
    }

    const now = new Date();
    const integrationStatus = await this.findIntegrationStatus(user, now);

    try {
      const external = await this.transicionaisRepo.createUser(user);

      return await this.saveSynced(external, integrationStatus, now);
    } catch (error) {
      const failed = this.toFailedStatus(integrationStatus, error, now);

      return this.saveFailure(user, failed);
    }
  }

  private shouldSync(user: User): boolean {
    const { sync } = user.metadata;

    return sync !== SyncStatus.Synced && sync !== SyncStatus.ManualRetry;
  }

  private async findIntegrationStatus(user: User, now: Date): Promise<IntegrationStatus> {
    const found = await this.hormoniosRepository.findIntegrationStatus(IntegrationEntity.User, user.id);

    return found ?? IntegrationStatus.create(IntegrationEntity.User, user.id, now);
  }

  private toFailedStatus(integrationStatus: IntegrationStatus, error: unknown, now: Date): IntegrationStatus {
    const errorCtx = toErrorCtx(error);

    if (error instanceof UpstreamUnavailableError) {
      return integrationStatus.pending(errorCtx, now);
    }

    logger.error({ err: error, userId: integrationStatus.entityId }, "user rejected by Transicionais");

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
