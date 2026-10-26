import type { ISavePendingCapacityData } from "../../../interfaces/hormonios";
import { type ISnapshotData, SaveSnapshotRequest } from "./save-snapshot.request";

// parâmetros do rpc estoque_pendente (a troca da pendente e a trava do retrato ficam na função)
export interface ISavePendingCapacityParams {
  p_support_id: string;
  p_capacity: number;
  p_data: ISnapshotData;
}

export class SavePendingCapacityRequest {
  static fromDomain(data: ISavePendingCapacityData): ISavePendingCapacityParams {
    return { p_support_id: data.supportId, p_capacity: data.capacity, p_data: SaveSnapshotRequest.toData(data.event) };
  }
}
