import { z } from "zod";
import { AppError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import { type Attendance, AttendanceAnswer } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import { UuidSchema, validateSchema } from "../models/model-schema";
import type { MyReservation } from "../models/my-reservation";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { UUID } from "../interfaces/uuid";
import { MyReservationMapper } from "./mappers/my-reservation.mapper";

const logger = createLogger("ListMyReservationsUsecase");

export interface IListMyReservationsInput {
  deviceId: UUID;
}

const ListMyReservationsInputSchema = z.object({
  deviceId: UuidSchema,
});

export class ListMyReservationsUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(input: IListMyReservationsInput): Promise<MyReservation[]> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IListMyReservationsInput): Promise<MyReservation[]> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent();
    const attendances = await this.findSupabaseDeviceAttendances(event, input.deviceId);

    return attendances.map((attendance) => MyReservationMapper.toView(event, attendance));
  }

  private validateInput(input: IListMyReservationsInput) {
    validateSchema(ListMyReservationsInputSchema, input);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // só as linhas "vou", com e sem instrumento, inclusive as REJECTED (a tela mostra a recusa)
  private async findSupabaseDeviceAttendances(event: CurrentEvent, deviceId: UUID): Promise<Attendance[]> {
    const attendances = await this.hormoniosRepo.listByDevice({ dayKey: event.dayKey, deviceId });

    return attendances.filter((attendance) => attendance.answer === AttendanceAnswer.Going);
  }
}
