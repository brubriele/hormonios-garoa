import { z } from "zod";
import type { User } from "../../domain/User";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";

const logger = createLogger("FindingUserUsecase");

const FindingUserInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

type IFindingUserData = z.infer<typeof FindingUserInputSchema>;

export interface IFindingUserInput {
  email: string;
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

  private async _execute(input: IFindingUserInput): Promise<User | null> {
    const data = this.validateInput(input);

    return this.findUser(data.email);
  }

  private validateInput(input: IFindingUserInput): IFindingUserData {
    return validateSchema(FindingUserInputSchema, input);
  }

  private async findUser(email: string): Promise<User | null> {
    return this.hormoniosRepository.findUserByEmail(email);
  }
}
