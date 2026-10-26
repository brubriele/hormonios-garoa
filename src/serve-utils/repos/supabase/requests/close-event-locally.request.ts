import type { ICloseEventLocallyData } from "../../../interfaces/hormonios";
import { type ISnapshotData, SaveSnapshotRequest } from "./save-snapshot.request";

// hg_pending_syncs.data do EVENT_CREATION (lido de volta pelo PendingSyncResponse)
export interface IEventCreationSyncData {
  fromExternalId: string;
  fromDayKey: string;
  fromDate: string;
  date: string;
  dayKey: string;
}

// parâmetros do rpc encerrar_local (a troca do retrato e a fila vão na mesma transação)
export interface ICloseEventLocallyParams {
  p_data: ISnapshotData;
  p_sync: IEventCreationSyncData;
}

export class CloseEventLocallyRequest {
  static fromDomain(data: ICloseEventLocallyData): ICloseEventLocallyParams {
    return {
      p_data: SaveSnapshotRequest.toData(data.event),
      p_sync: {
        fromExternalId: data.fromExternalId,
        fromDayKey: data.fromDayKey,
        fromDate: data.fromDate,
        date: data.event.date,
        dayKey: data.event.dayKey,
      },
    };
  }
}
