import { z } from "zod";
import type { Event } from "../../domain/Event";
import type { User } from "../../domain/User";
import { AppError, NotFoundError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";
import { UuidSchema, validateSchema } from "../../lib/schema";

const logger = createLogger("FindingUserBookingUsecase", LogContext.User);

const FindingUserBookingInputSchema = z.object({
  userId: UuidSchema.nullable(),
});

type IFindingUserBookingData = z.infer<typeof FindingUserBookingInputSchema>;

export interface IFindingUserBookingInput {
  userId: string | null;
}

export class FindingUserBookingUsecase {
  static readonly token = "FindingUserBookingUsecase";

  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(input: IFindingUserBookingInput): Promise<User> {
    try {
      const user = await this._execute(input);

      return user;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error, { hormoniosUserId: input.userId ?? undefined });
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // D3, D16
  private async _execute(input: IFindingUserBookingInput): Promise<User> {
    logger.track("finding user booking", { hormoniosUserId: input.userId ?? undefined });

    const data = this.validateInput(input);
    const userId = this.validateUserId(data.userId);
    const event = await this.findCurrentEvent();

    return this.findUser(userId, event);
  }

  private validateInput(input: IFindingUserBookingInput): IFindingUserBookingData {
    return validateSchema(FindingUserBookingInputSchema, input);
  }

  private validateUserId(userId: string | null): string {
    if (userId === null) {
      throw new NotFoundError("User Not Found");
    }

    return userId;
  }

  // D2
  private async findCurrentEvent(): Promise<Event> {
    const event = await this.hormoniosRepository.findCurrentEvent();

    if (!event) {
      throw new NotFoundError("Event Not Found");
    }

    return event;
  }

  private async findUser(userId: string, event: Event): Promise<User> {
    const user = await this.hormoniosRepository.findUserById(userId, event);

    if (!user) {
      throw new NotFoundError("User Not Found");
    }

    return user;
  }
}
