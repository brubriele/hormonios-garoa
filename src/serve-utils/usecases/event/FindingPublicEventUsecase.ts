import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import { AppError, NotFoundError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";

const logger = createLogger("FindingPublicEventUsecase", LogContext.Event);

export class FindingPublicEventUsecase {
  static readonly token = "FindingPublicEventUsecase";

  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(): Promise<Event> {
    try {
      const event = await this._execute();

      return event;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error);
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // F4
  private async _execute(): Promise<Event> {
    logger.track("finding public event");

    const event = await this.findCurrentEvent();
    const attendances = await this.findEventAttendance(event);

    return event.withAttendances(attendances, false);
  }

  // D2
  private async findCurrentEvent(): Promise<Event> {
    const event = await this.hormoniosRepository.findCurrentEvent();

    if (!event) {
      throw new NotFoundError("Event Not Found");
    }

    return event;
  }

  private async findEventAttendance(event: Event): Promise<Attendance[]> {
    return this.hormoniosRepository.findEventAttendance(event);
  }
}
