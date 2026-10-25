import { AttendanceAnswer, AttendanceSync } from "../../../models/attendance";
import type { IAttendanceDataParams } from "./reserve.request";

// update de hg_attendances do "Não vou": libera a vaga e volta a PENDING, para o envio
export interface ICancelByDeviceBody {
  data: IAttendanceDataParams;
  transicionais_sync: AttendanceSync;
  sync_error: null;
  attempts: number;
  next_attempt_at: string;
  updated_at: string;
}

export class CancelByDeviceRequest {
  static fromDomain(now: string): ICancelByDeviceBody {
    return {
      data: { answer: AttendanceAnswer.NotGoing, groupId: null, supportIds: [] },
      transicionais_sync: AttendanceSync.Pending,
      sync_error: null,
      attempts: 0,
      next_attempt_at: now,
      updated_at: now,
    };
  }
}
