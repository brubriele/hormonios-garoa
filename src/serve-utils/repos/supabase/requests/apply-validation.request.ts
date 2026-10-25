import type { IApplyValidationData } from "../../../interfaces/hormonios";
import type { IAttendanceDataParams } from "./reserve.request";

// parâmetros do rpc aplicar_validacao (as travas de changedAt e da mudança local ficam na função)
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
export interface IApplyValidationParams {
  p_order_id: string | null;
  p_day_key: string;
  p_guest_id: string | null;
  p_email: string | null;
  p_data: IAttendanceDataParams;
  p_changed_at: string;
}

/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class ApplyValidationRequest {
  static fromDomain(data: IApplyValidationData): IApplyValidationParams {
    return {
      p_order_id: data.orderId,
      p_day_key: data.dayKey,
      p_guest_id: data.guestId,
      p_email: data.email,
      p_data: { answer: data.answer, groupId: data.groupId, supportIds: data.supportIds },
      p_changed_at: data.changedAt,
    };
  }
}
