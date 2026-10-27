import type { IAddGroupsData } from "../../../interfaces/transicionais";
import { numericId } from "../transicionais-id";

// corpo do PUT v2/manager-events/details/{id}/groups: os grupos esperados a partir do dia em que o
// encontro foi criado
export interface IEventGroupsBody {
  groupId: number[];
  createdAt: string; // YYYY-MM-DD
}

export class EventGroupsRequest {
  static fromDomain(data: IAddGroupsData): IEventGroupsBody {
    return {
      groupId: data.groupIds.map((id: string) => numericId(id, "groupId")),
      createdAt: data.createdAt.slice(0, 10),
    };
  }
}
