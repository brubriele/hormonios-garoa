import type { IReserveData } from "../../../interfaces/hormonios";
import type { UUID } from "../../../interfaces/uuid";
import { AttendanceAnswer } from "../../../models/attendance";

// jsonb de hg_attendances.data (também gravado pelo "Não vou" e pela aplicar_validacao)
export interface IAttendanceDataParams {
  answer: AttendanceAnswer;
  groupId: string | null; // null = só presença
  supportIds: string[];
}

// parâmetros do rpc reservar (a trava da última vaga fica na função)
export interface IReserveParams {
  p_user_id: UUID;
  p_day_key: string;
  p_device_id: UUID;
  p_data: IAttendanceDataParams;
}

export class ReserveRequest {
  static fromDomain(data: IReserveData): IReserveParams {
    return {
      p_user_id: data.user.id,
      p_day_key: data.dayKey,
      p_device_id: data.deviceId,
      p_data: { answer: AttendanceAnswer.Going, groupId: data.groupId, supportIds: data.supportIds },
    };
  }
}
