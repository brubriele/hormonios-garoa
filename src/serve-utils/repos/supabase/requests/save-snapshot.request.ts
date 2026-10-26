import type { CurrentEvent } from "../../../models/current-event";
import type { CurrentEventSnapshot } from "../../../models/current-event-snapshot";

// jsonb do retrato sem o whatsappUrl, que é só do Hormônios: a função gravar_retrato mantém o gravado
export interface ISnapshotData {
  dayKey: string;
  date: string;
  time: string;
  location: string;
  bookingOpen: boolean;
  instruments: {
    id: string;
    name: string;
    stockTotal: number | null;
    active: boolean;
    taken?: number;
    instrumentSupportId?: string;
    rotativo: boolean;
  }[];
  accessories: {
    id: string;
    name: string;
    stockTotal: number | null;
    taken?: number;
    rotativo: boolean;
    groupIds: string[];
  }[];
}

// parâmetros do rpc gravar_retrato (a trava do retrato fica na função)
export interface ISaveSnapshotParams {
  p_external_id: string;
  p_version: number;
  p_hash: string | null;
  p_vacancies_at: string;
  p_data: ISnapshotData;
}

export class SaveSnapshotRequest {
  static fromDomain(snapshot: CurrentEventSnapshot): ISaveSnapshotParams {
    return {
      p_external_id: snapshot.externalId,
      p_version: snapshot.version,
      p_hash: snapshot.hash,
      p_vacancies_at: snapshot.vacanciesAt,
      p_data: SaveSnapshotRequest.toData(snapshot.event),
    };
  }

  // o jsonb do retrato; usado também pelo estoque pendente e pelo encerramento local (D51, D53)
  static toData(event: CurrentEvent): ISnapshotData {
    return {
      dayKey: event.dayKey,
      date: event.date,
      time: event.time,
      location: event.location,
      bookingOpen: event.bookingOpen,
      // taken e instrumentSupportId ausentes no jsonb quando null (o retrato da fase 1 não tem)
      instruments: event.instruments.map((instrument) => ({
        id: instrument.id,
        name: instrument.name,
        stockTotal: instrument.stockTotal,
        active: instrument.active,
        ...(instrument.taken === null ? {} : { taken: instrument.taken }),
        ...(instrument.instrumentSupportId === null ? {} : { instrumentSupportId: instrument.instrumentSupportId }),
        rotativo: instrument.rotativo,
      })),
      accessories: event.accessories.map((accessory) => ({
        id: accessory.id,
        name: accessory.name,
        stockTotal: accessory.stockTotal,
        ...(accessory.taken === null ? {} : { taken: accessory.taken }),
        rotativo: accessory.rotativo,
        groupIds: accessory.groupIds,
      })),
    };
  }
}
