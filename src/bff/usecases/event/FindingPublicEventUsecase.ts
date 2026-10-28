import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import { EventMapper } from "../../domain/mappers/EventMapper";
import { AppError, NotFoundError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";

const logger = createLogger("FindingPublicEventUsecase", LogContext.Event);

export class FindingPublicEventUsecase {
  static readonly token = "FindingPublicEventUsecase";

  constructor(
    private readonly hormoniosRepository: IHormoniosRepository,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

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

  // D2, spec-4 A3
  private async findCurrentEvent(): Promise<Event> {
    const event = await this.hormoniosRepository.findCurrentEvent();

    if (event) {
      return event;
    }

    const external = await this.findTransicionaisEvent();
    const created = await this.createEvent(external);

    return created;
  }

  // spec-4 A2, A3
  private async findTransicionaisEvent(): Promise<Event> {
    try {
      const external = await this.transicionaisRepo.findLastPublicEvent();

      return external;
    } catch (error) {
      if (error instanceof UpstreamUnavailableError || error instanceof NotFoundError) {
        throw new NotFoundError("Event Not Found");
      }

      throw error;
    }
  }

  // fase-2 W5
  private async createEvent(external: Event): Promise<Event> {
    const id = globalThis.crypto.randomUUID();
    const json = external.toJson();
    const event = EventMapper.fromData({ ...json, id, whatsappUrl: null, bookingOpen: false });
    const created = await this.hormoniosRepository.createEvent(event);

    return created;
  }

  private async findEventAttendance(event: Event): Promise<Attendance[]> {
    return this.hormoniosRepository.findEventAttendance(event);
  }
}
