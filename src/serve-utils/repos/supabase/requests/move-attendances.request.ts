import type { IMoveAttendancesData } from "../../../interfaces/hormonios";

// parâmetros do rpc migrar_fase1 (E2.2)
export interface IMoveAttendancesParams {
  p_old_day_key: string;
  p_new_day_key: string;
  p_group_map: Record<string, string>; // groupId antigo -> novo
}

export class MoveAttendancesRequest {
  static fromDomain(data: IMoveAttendancesData): IMoveAttendancesParams {
    return { p_old_day_key: data.oldDayKey, p_new_day_key: data.newDayKey, p_group_map: data.groupMap };
  }
}
