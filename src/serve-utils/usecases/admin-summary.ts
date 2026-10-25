import { AppError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import type { AdminSummary } from "../models/admin-summary";
import type { Attendance } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import { AdminSummaryMapper } from "./mappers/admin-summary.mapper";

const logger = createLogger("AdminSummaryUsecase");

export class AdminSummaryUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(): Promise<AdminSummary> {
    try {
      return await this._execute(); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(): Promise<AdminSummary> {
    const event = await this.findSupabaseCurrentEvent();
    const attendances = await this.findSupabaseAttendances(event.dayKey);

    return AdminSummaryMapper.toView(event, attendances);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  private async findSupabaseAttendances(dayKey: string): Promise<Attendance[]> {
    return this.hormoniosRepo.listByDay(dayKey);
  }
}
