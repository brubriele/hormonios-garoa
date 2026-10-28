import { type Attendance, AttendanceAnswer } from "../../../domain/Attendance";
import { type Event, type EventGroup, EventCatalogType } from "../../../domain/Event";
import type { UserAccount } from "../../../domain/User";
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

// corpo do POST v2/manager-validations/change com o token de membro, em nome da pessoa (D41):
// profileGuestId (convidado) ou profileId (membro), nunca os dois
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
  static fromDomain(attendance: Attendance, event: Event, account: UserAccount, dayId: number): IValidationChangeBody {
    const attending = attendance.metadata.answer === AttendanceAnswer.Going;
    const group = attending ? attendance.eventGroup : null;
    const body: IValidationChangeBody = {
      type: ValidationType.Attendance,
      configDayId: dayId,
      status: attending ? ValidationAnswer.Attending : ValidationAnswer.Declined,
      supportTypeIds: [],
    };

    if (account.profileGuestId !== null) {
      body.profileGuestId = account.profileGuestId;
    }

    if (account.profileGuestId === null && account.profileId !== null) {
      body.profileId = account.profileId;
    }

    if (group !== null) {
      body.groupId = numericId(group.id, "groupId");
      body.supportTypeIds = ValidationChangeRequest.toSupportTypeIds(attendance, event, group);
    }

    return body;
  }

  // spec-4 D4
  private static toSupportTypeIds(attendance: Attendance, event: Event, group: EventGroup): number[] {
    const instrument = event.catalog.find(
      (item) => item.metadata.type === EventCatalogType.Instrument && item.metadata.groupIds.includes(group.id),
    );
    const accessoryIds = attendance.catalog.map((item) => item.id);
    const ids = instrument ? [instrument.id, ...accessoryIds] : accessoryIds;

    return ids.map((id) => numericId(id, "supportTypeId"));
  }
}
