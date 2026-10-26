import type { ICloseEventLocallyData } from "../../../interfaces/hormonios";
import { type ISnapshotData, SaveSnapshotRequest } from "./save-snapshot.request";

// hg_pending_writes.data do NEXT_EVENT (lido de volta pelo PendingWriteResponse)
export interface INextEventWriteData {
  fromExternalId: string;
  fromDayKey: string;
  fromDate: string;
  date: string;
  dayKey: string;
}

// parâmetros do rpc encerrar_local (a troca do retrato e a fila vão na mesma transação)
export interface ICloseEventLocallyParams {
  p_data: ISnapshotData;
  p_write: INextEventWriteData;
}

export class CloseEventLocallyRequest {
  static fromDomain(data: ICloseEventLocallyData): ICloseEventLocallyParams {
    return {
      p_data: SaveSnapshotRequest.toData(data.event),
      p_write: {
        fromExternalId: data.fromExternalId,
        fromDayKey: data.fromDayKey,
        fromDate: data.fromDate,
        date: data.event.date,
        dayKey: data.event.dayKey,
      },
    };
  }
}
