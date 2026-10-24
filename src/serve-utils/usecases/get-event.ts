import { AppError } from "../errors/app-error";
import type { Attendance } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import { toEventView, type IEventView } from "./event-summary";

export class GetEventUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(): Promise<IEventView> {
    try {
      return await this._execute(); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[GetEventUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  private async _execute(): Promise<IEventView> {
    const event = await this.findSupabaseCurrentEvent();
    const attendances = await this.findSupabaseAttendances(event.dayKey);

    return toEventView(event, attendances);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  private async findSupabaseAttendances(dayKey: string): Promise<Attendance[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }
}
