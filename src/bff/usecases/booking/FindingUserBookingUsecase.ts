import { z } from "zod";
import type { Event } from "../../domain/Event";
import { EventPosition, FindingInternalFilter } from "../../domain/FindingInternalFilter";
import type { ManagerEvent } from "../../domain/ManagerEvent";
import type { User } from "../../domain/User";
import { UserBooking } from "../../domain/UserBooking";
import { AppError, NotFoundError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";
import { UuidSchema, validateSchema } from "../../lib/schema";

const logger = createLogger("FindingUserBookingUsecase", LogContext.User);

const FindingUserBookingInputSchema = z.object({
  userId: UuidSchema,
});

type IFindingUserBookingData = z.infer<typeof FindingUserBookingInputSchema>;

export interface IFindingUserBookingInput {
  userId: string; // spec-9 C1
}

export class FindingUserBookingUsecase {
  static readonly token = "FindingUserBookingUsecase";

  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(input: IFindingUserBookingInput): Promise<UserBooking> {
    try {
      const userBooking = await this._execute(input);

      return userBooking;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error, { hormoniosUserId: input.userId });
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // D3, D16, spec-8 D5, spec-9 C1
  private async _execute(input: IFindingUserBookingInput): Promise<UserBooking> {
    logger.track("finding user booking", { hormoniosUserId: input.userId });

    const data = this.validateInput(input);
    const managerEvent = await this.findCurrentEvent();
    const user = await this.findUser(data.userId, managerEvent.event);

    return new UserBooking(managerEvent, user);
  }

  private validateInput(input: IFindingUserBookingInput): IFindingUserBookingData {
    return validateSchema(FindingUserBookingInputSchema, input);
  }

  // D2, spec-8 D5
  private async findCurrentEvent(): Promise<ManagerEvent> {
    const filter = new FindingInternalFilter({ position: EventPosition.Current });
    const managerEvent = await this.hormoniosRepository.findCurrentEvent(filter);

    if (!managerEvent) {
      throw new NotFoundError("Event Not Found");
    }

    return managerEvent;
  }

  private async findUser(userId: string, event: Event): Promise<User> {
    const user = await this.hormoniosRepository.findUser({ id: userId, event });

    if (!user) {
      throw new NotFoundError("User Not Found");
    }

    return user;
  }
}
