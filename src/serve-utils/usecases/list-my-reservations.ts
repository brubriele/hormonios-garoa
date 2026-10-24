import { AppError } from "../errors/app-error";
import type { Attendance } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { UUID } from "../interfaces/uuid";

export interface IListMyReservationsInput {
  deviceId: UUID;
}

export interface IMyReservationView {
  id: UUID;
  groupId: string | null;
  groupName: string | null;
  supportIds: string[];
  name: string;
  pronoun: string;
}

export class ListMyReservationsUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(input: IListMyReservationsInput): Promise<IMyReservationView[]> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[ListMyReservationsUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IListMyReservationsInput): Promise<IMyReservationView[]> {
    const event = await this.findSupabaseCurrentEvent();
    const attendances = await this.findSupabaseDeviceAttendances(event, input.deviceId);

    return attendances.map((attendance) => ({
      id: attendance.id,
      groupId: attendance.groupId,
      groupName: attendance.groupId === null ? null : event.findGroup(attendance.groupId)?.name ?? null,
      supportIds: attendance.supportIds,
      name: attendance.user.name,
      pronoun: attendance.user.pronoun,
    }));
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // só as linhas "vou", com e sem instrumento
  private async findSupabaseDeviceAttendances(event: CurrentEvent, deviceId: UUID): Promise<Attendance[]> {
    const attendances = await this.hormoniosRepo.listByDevice({ dayKey: event.dayKey, deviceId });

    return attendances.filter((attendance) => attendance.isGoing);
  }
}
