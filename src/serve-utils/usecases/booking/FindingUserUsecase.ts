import { z } from "zod";
import { Event } from "../../domain/Event";
import { UserMapper } from "../../domain/mappers/UserMapper";
import type { User } from "../../domain/User";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { emailHash } from "../../lib/hash";
import { createLogger } from "../../lib/logger";
import { UuidSchema, validateSchema } from "../../lib/schema";

const logger = createLogger("FindingUserUsecase");

const EmailSchema = z.email();

const FindingUserInputSchema = z.object({
  email: z.string().trim().toLowerCase(),
  userId: UuidSchema.nullable(),
  emailHash: z.string().nullable(),
  event: z.instanceof(Event),
});

type IFindingUserData = z.infer<typeof FindingUserInputSchema>;

export interface IFindingUserInput {
  email: string;
  userId: string | null;
  emailHash: string | null;
  event: Event;
}

export class FindingUserUsecase {
  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(input: IFindingUserInput): Promise<User | null> {
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

  // D3
  private async _execute(input: IFindingUserInput): Promise<User | null> {
    const data = this.validateInput(input);
    const cookieUser = await this.findCookieUser(data);

    if (cookieUser) {
      return cookieUser;
    }

    this.validateEmail(data.email);

    return this.findUserByEmail(data.email);
  }

  private validateInput(input: IFindingUserInput): IFindingUserData {
    return validateSchema(FindingUserInputSchema, input);
  }

  private async findCookieUser(data: IFindingUserData): Promise<User | null> {
    if (data.userId === null) {
      return null;
    }

    const user = await this.hormoniosRepository.findUserById(data.userId, data.event);

    if (!user) {
      return null;
    }

    const sameEmail = data.email === user.email || this.isSameAnonymizedEmail(data, user);

    if (!sameEmail) {
      return null;
    }

    const json = user.toJson();

    return UserMapper.fromData(json, []);
  }

  private isSameAnonymizedEmail(data: IFindingUserData, user: User): boolean {
    const anonymized = data.email === user.anonymizedEmail;
    const hash = emailHash(user.email);

    return anonymized && data.emailHash === hash;
  }

  private validateEmail(email: string): void {
    validateSchema(EmailSchema, email, "email");
  }

  private async findUserByEmail(email: string): Promise<User | null> {
    return this.hormoniosRepository.findUserByEmail(email);
  }
}
