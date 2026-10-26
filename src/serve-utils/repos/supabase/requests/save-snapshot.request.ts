import type { EventSnapshot } from "../../../models/event-snapshot";

// jsonb do retrato sem o whatsappUrl, que é só do Hormônios: a função gravar_retrato mantém o gravado
interface ISnapshotData {
  dayKey: string;
  date: string;
  time: string;
  location: string;
  bookingOpen: boolean;
  groups: {
    id: string;
    name: string;
    stockTotal: number | null;
    active: boolean;
    taken?: number;
    instrumentSupportId?: string;
    rotativo: boolean;
  }[];
  supports: {
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
  static fromDomain(snapshot: EventSnapshot): ISaveSnapshotParams {
    const event = snapshot.event;

    return {
      p_external_id: snapshot.externalId,
      p_version: snapshot.version,
      p_hash: snapshot.hash,
      p_vacancies_at: snapshot.vacanciesAt,
      p_data: {
        dayKey: event.dayKey,
        date: event.date,
        time: event.time,
        location: event.location,
        bookingOpen: event.bookingOpen,
        // taken e instrumentSupportId ausentes no jsonb quando null (o retrato da fase 1 não tem)
        groups: event.groups.map((group) => ({
          id: group.id,
          name: group.name,
          stockTotal: group.stockTotal,
          active: group.active,
          ...(group.taken === null ? {} : { taken: group.taken }),
          ...(group.instrumentSupportId === null ? {} : { instrumentSupportId: group.instrumentSupportId }),
          rotativo: group.rotativo,
        })),
        supports: event.supports.map((support) => ({
          id: support.id,
          name: support.name,
          stockTotal: support.stockTotal,
          ...(support.taken === null ? {} : { taken: support.taken }),
          rotativo: support.rotativo,
          groupIds: support.groupIds,
        })),
      },
    };
  }
}
