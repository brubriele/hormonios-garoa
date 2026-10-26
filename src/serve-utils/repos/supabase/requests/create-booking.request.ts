import type { ICreateBookingData } from "../../../interfaces/hormonios";
import type { UUID } from "../../../interfaces/uuid";
import { BookingAnswer } from "../../../models/booking";

// jsonb de hg_attendances.data (também gravado pelo "Não vou" e pela aplicar_validacao)
export interface IBookingDataParams {
  answer: BookingAnswer;
  groupId: string | null; // null = só presença
  supportIds: string[];
}

// parâmetros do rpc reservar (a trava da última vaga fica na função)
export interface ICreateBookingParams {
  p_user_id: UUID;
  p_day_key: string;
  p_device_id: UUID;
  p_data: IBookingDataParams;
}

export class CreateBookingRequest {
  static fromDomain(data: ICreateBookingData): ICreateBookingParams {
    return {
      p_user_id: data.user.id,
      p_day_key: data.dayKey,
      p_device_id: data.deviceId,
      p_data: { answer: BookingAnswer.Going, groupId: data.groupId, supportIds: data.supportIds },
    };
  }
}
