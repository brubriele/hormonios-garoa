import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import { EventPosition, FindingInternalFilter } from "../../domain/FindingInternalFilter";
import type { ManagerEvent } from "../../domain/ManagerEvent";
import { AppError } from "../../errors/app-error";
import { createLogger, LogContext } from "../../lib/logger";
import type { FindingInternalEventUsecase } from "./FindingInternalEventUsecase";

const logger = createLogger("FindingPublicEventUsecase", LogContext.Event);

export class FindingPublicEventUsecase {
  static readonly token = "FindingPublicEventUsecase";

  constructor(private readonly findingInternalEventUsecase: FindingInternalEventUsecase) {}

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

  // F4, spec-8 D3
  private async _execute(): Promise<Event> {
    logger.track("finding public event");

    const managerEvent = await this.findCurrentEvent();
    const attendances = this.toAttendances(managerEvent);

    return managerEvent.event.withAttendances(attendances, false);
  }

  // spec-8 B5
  private async findCurrentEvent(): Promise<ManagerEvent> {
    const filter = new FindingInternalFilter({ position: EventPosition.Current });
    const managerEvent = await this.findingInternalEventUsecase.execute(filter);

    return managerEvent;
  }

  private toAttendances(managerEvent: ManagerEvent): Attendance[] {
    return managerEvent.users.flatMap((user) => user.attendances);
  }
}
