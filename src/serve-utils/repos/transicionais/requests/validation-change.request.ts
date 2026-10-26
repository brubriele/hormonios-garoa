import type { ISendAttendanceData } from "../../../interfaces/transicionais";
import { AttendanceAnswer } from "../../../models/attendance";
import { numericId } from "../transicionais-id";

// tipo da validação: o Hormônios só envia presença
export enum ValidationType {
  Attendance = "ATTENDANCE",
}

// resposta do convidado no Transicionais. TENTATIVE (talvez) só chega pelo webhook (dúvida D37)
export enum ValidationAnswer {
  Attending = "ATTENDING",
  Declined = "DECLINED",
  Tentative = "TENTATIVE",
}

// corpo do POST v2/manager-validations/change com o token de membro, em nome da conta da pessoa
// (D41): profileGuestId (convidado) ou profileId (membro), nunca os dois
export interface IValidationChangeBody {
  type: ValidationType;
  configDayId: number;
  profileGuestId?: string;
  profileId?: number;
  status: ValidationAnswer;
  groupId?: number; // ausente = só presença ("Não se aplica")
  supportTypeIds: number[];
}

export class ValidationChangeRequest {
  // só presença ou "não vou": sem groupId e com supportTypeIds vazio
  static fromDomain(data: ISendAttendanceData): IValidationChangeBody {
    const attending = data.answer === AttendanceAnswer.Going;
    const groupId = attending && data.groupId !== null ? numericId(data.groupId, "groupId") : undefined;
    const { guestId, memberId } = data.account;

    return {
      type: ValidationType.Attendance,
      configDayId: numericId(data.dayKey, "configDayId"),
      ...(guestId === null ? {} : { profileGuestId: guestId }),
      ...(guestId === null && memberId !== null ? { profileId: numericId(memberId, "profileId") } : {}),
      status: attending ? ValidationAnswer.Attending : ValidationAnswer.Declined,
      ...(groupId === undefined ? {} : { groupId }),
      supportTypeIds:
        groupId === undefined ? [] : [...new Set(data.supportTypeIds)].map((id) => numericId(id, "supportTypeId")),
    };
  }
}
