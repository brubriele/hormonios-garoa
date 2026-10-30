import { z } from "zod";
import { Event } from "../../domain/Event";
import { EventPosition, FindingInternalFilter } from "../../domain/FindingInternalFilter";
import type { ManagerEvent } from "../../domain/ManagerEvent";
import { AppError, NotFoundError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";

const logger = createLogger("BookingAvailabilityUsecase", LogContext.Event);

const BookingAvailabilityInputSchema = z.instanceof(Event);

export class BookingAvailabilityUsecase {
  static readonly token = "BookingAvailabilityUsecase";

  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(event: Event): Promise<Event> {
    try {
      const updated = await this._execute(event);

      return updated;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error, { hormoniosEventId: event.id });
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // spec-8 B2, B7
  private async _execute(event: Event): Promise<Event> {
    logger.track("changing booking availability", { hormoniosEventId: event.id, isActive: event.isActive });

    const valid = this.validateInput(event);
    const current = await this.findCurrentEvent();

    return this.updateCurrentEvent(current, valid.isActive);
  }

  private validateInput(event: Event): Event {
    return validateSchema(BookingAvailabilityInputSchema, event);
  }

  private async findCurrentEvent(): Promise<ManagerEvent> {
    const filter = new FindingInternalFilter({ position: EventPosition.Current });
    const current = await this.hormoniosRepository.findCurrentEvent(filter);

    if (!current) {
      throw new NotFoundError("Current Event Not Found");
    }

    return current;
  }

  private async updateCurrentEvent(current: ManagerEvent, isActive: boolean): Promise<Event> {
    return this.hormoniosRepository.updateCurrentEvent(current.event, isActive, null, null);
  }
}
