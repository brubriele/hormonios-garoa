import { AppError } from "../errors/app-error";
import type { Attendance } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import { toAdminSummary, type IAdminSummary } from "./event-summary";

export class AdminSummaryUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(): Promise<IAdminSummary> {
    try {
      return await this._execute(); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[AdminSummaryUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  private async _execute(): Promise<IAdminSummary> {
    const event = await this.findSupabaseCurrentEvent();
    const attendances = await this.findSupabaseAttendances(event.dayKey);

    return toAdminSummary(event, attendances);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  private async findSupabaseAttendances(dayKey: string): Promise<Attendance[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }
}
