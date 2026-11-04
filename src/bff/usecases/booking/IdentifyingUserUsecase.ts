import { z } from "zod";
import { type IUserData, UserMapper } from "../../domain/mappers/UserMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import { User } from "../../domain/User";
import { AppError } from "../../errors/app-error";
import { createLogger, LogContext } from "../../lib/logger";
import { UuidSchema, validateSchema } from "../../lib/schema";
import type { CreatingOrUpdateUserUsecase } from "./CreatingOrUpdateUserUsecase";
import type { FindingUserUsecase } from "./FindingUserUsecase";

const logger = createLogger("IdentifyingUserUsecase", LogContext.User);

export const IdentifyingUserCommandSchema = z.object({
  user: z.instanceof(User),
  userId: UuidSchema.nullable(),
  emailHash: z.string().nullable(),
});

// spec-9 A1
export interface IdentifyingUserCommand {
  user: User;
  userId: string | null;
  emailHash: string | null;
}

export class IdentifyingUserUsecase {
  constructor(
    private readonly findingUserUsecase: FindingUserUsecase,
    private readonly creatingOrUpdateUserUsecase: CreatingOrUpdateUserUsecase,
  ) {}

  async execute(command: IdentifyingUserCommand): Promise<User> {
    try {
      const user = await this._execute(command);

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error, { hormoniosUserId: command.userId ?? undefined });
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // spec-9 A2, A3
  private async _execute(command: IdentifyingUserCommand): Promise<User> {
    logger.track("identifying user", { hormoniosUserId: command.userId ?? undefined });

    const valid = this.validateInput(command);
    const found = await this.findUser(valid);
    const user = this.toUser(found, valid.user);

    if (found && !this.hasChanged(found, user)) {
      return found;
    }

    return this.createOrUpdateUser(user);
  }

  private validateInput(command: IdentifyingUserCommand): IdentifyingUserCommand {
    return validateSchema(IdentifyingUserCommandSchema, command);
  }

  private async findUser(command: IdentifyingUserCommand): Promise<User | null> {
    return this.findingUserUsecase.execute(command);
  }

  private toUser(found: User | null, incoming: User): User {
    if (!found) {
      const id = globalThis.crypto.randomUUID();
      const userData: IUserData = {
        id,
        name: incoming.name,
        pronoun: incoming.pronoun,
        email: incoming.email,
        metadata: { integrationId: null, sync: SyncStatus.Pending, syncError: null, syncHash: null, syncedAt: null, version: null, account: null },
      };

      return UserMapper.fromData(userData, []);
    }

    const json = found.toJson();
    const metadata = { ...json.metadata, sync: SyncStatus.Pending, syncError: null };

    return UserMapper.fromData({ ...json, name: incoming.name, pronoun: incoming.pronoun, metadata }, []);
  }

  // spec-9 A3
  private hasChanged(found: User, user: User): boolean {
    return found.name !== user.name || found.pronoun !== user.pronoun;
  }

  private async createOrUpdateUser(user: User): Promise<User> {
    return this.creatingOrUpdateUserUsecase.execute(user);
  }
}
