import { numericId } from "../transicionais-id";

// corpo do POST v2/manager-events/details/delete (em lote; o Hormônios apaga um por vez, D13)
export interface IDeleteEventsBody {
  ids: number[];
}

export class DeleteEventsRequest {
  static fromDomain(eventId: string): IDeleteEventsBody {
    return { ids: [numericId(eventId, "eventId")] };
  }
}
