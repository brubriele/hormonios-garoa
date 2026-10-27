import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import { ManagerEvent } from "../../domain/ManagerEvent";
import type { User } from "../../domain/User";
import { AppError, NotFoundError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger } from "../../lib/logger";
import { emptyState } from "../../repos/supabase/mock/emptyState";
import { CreatingInternalEventUsecase } from "./CreatingInternalEventUsecase";

const logger = createLogger("FindingInternalEventUsecase");

export class FindingInternalEventUsecase {
  constructor(
    private readonly hormoniosRepository: IHormoniosRepository,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(): Promise<ManagerEvent> {
    try {
      return await this._execute();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // D5, F4
  private async _execute(): Promise<ManagerEvent> {
    const event = await this.findCurrentEventOrMock();
    const attendances = await this.findEventAttendance(event);
    const users = await this.findEventUsers(event);
    const counted = event.withAttendances(attendances, true);

    return new ManagerEvent(counted, users);
  }

  private async findCurrentEventOrMock(): Promise<Event> {
    try {
      return await this.findCurrentEvent();
    } catch (error) {
      if (error instanceof NotFoundError) {
        return this.createMockEvent();
      }

      throw error;
    }
  }

  private async createMockEvent(): Promise<Event> {
    try {
      const event = emptyState();
      const usecase = new CreatingInternalEventUsecase(this.hormoniosRepository, this.transicionaisRepo);

      const newEvent = await usecase.execute(event);

      logger.info('createMockEvent', newEvent.id)

      return newEvent
    } catch (error) {
      logger.error({ err: error }, "mock event not created");
      throw new NotFoundError("Event Not Found");
    }
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

  private async findEventUsers(event: Event): Promise<User[]> {
    return this.hormoniosRepository.findEventUsers(event);
  }
}
