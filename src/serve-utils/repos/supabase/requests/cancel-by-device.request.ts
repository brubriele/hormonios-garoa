import { BookingAnswer, BookingSync } from "../../../models/booking";
import type { IBookingDataParams } from "./create-booking.request";

// update de hg_attendances do "Não vou": libera a vaga e volta a PENDING, para o envio
export interface ICancelByDeviceBody {
  data: IBookingDataParams;
  transicionais_sync: BookingSync;
  sync_error: null;
  attempts: number;
  next_attempt_at: string;
  updated_at: string;
}

export class CancelByDeviceRequest {
  static fromDomain(now: string): ICancelByDeviceBody {
    return {
      data: { answer: BookingAnswer.NotGoing, groupId: null, supportIds: [] },
      transicionais_sync: BookingSync.Pending,
      sync_error: null,
      attempts: 0,
      next_attempt_at: now,
      updated_at: now,
    };
  }
}
