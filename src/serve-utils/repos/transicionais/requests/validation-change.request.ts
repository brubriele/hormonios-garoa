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

export interface IValidationChangePerson {
  email: string;
  name: string;
  pronoun: string;
}

// corpo do POST v2/community/validations/change com o token de membro, em nome do convidado
// (E2.8; setup-hormonios.md, item 6: ainda fora do contrato local, D3)
export interface IValidationChangeBody {
  type: ValidationType;
  configDayId: number;
  status: ValidationAnswer;
  groupId?: number; // ausente = só presença ("Não se aplica")
  supportTypeIds: number[];
  person: IValidationChangePerson;
  idempotencyKey: string; // <id>:<updated_at>: a mesma nos reenvios da mesma mudança
}

export class ValidationChangeRequest {
  // só presença ou "não vou": sem groupId e com supportTypeIds vazio
  static fromDomain(data: ISendAttendanceData): IValidationChangeBody {
    const attending = data.answer === AttendanceAnswer.Going;
    const groupId = attending && data.groupId !== null ? numericId(data.groupId, "groupId") : undefined;

    return {
      type: ValidationType.Attendance,
      configDayId: numericId(data.dayKey, "configDayId"),
      status: attending ? ValidationAnswer.Attending : ValidationAnswer.Declined,
      ...(groupId === undefined ? {} : { groupId }),
      supportTypeIds:
        groupId === undefined ? [] : [...new Set(data.supportTypeIds)].map((id) => numericId(id, "supportTypeId")),
      person: data.person,
      idempotencyKey: `${data.attendanceId}:${data.updatedAt}`,
    };
  }
}
