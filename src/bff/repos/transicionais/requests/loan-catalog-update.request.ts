import type { EventCatalog } from "../../../domain/Event";
import type { ILoanCatalog, LoanCatalogKind } from "../responses/loan-catalog.response";
import { numericId } from "../transicionais-id";

// corpo do PUT v2/manager-support-types/{id} (LoanCatalogUpdateRequest): sempre inteiro, porque
// groupIds omitido faria a assistência valer para a organização inteira (D26)
export interface ILoanCatalogUpdateBody {
  title: string;
  description: string | null;
  isActive: boolean;
  capacity: number | null;
  groupIds: number[];
  rotativo: boolean;
  requiredForActivity: boolean;
  type?: LoanCatalogKind; // só se o GET trouxe (fora do contrato local, D23)
}

export class LoanCatalogUpdateRequest {
  static fromDomain(item: EventCatalog, current: ILoanCatalog): ILoanCatalogUpdateBody {
    const body: ILoanCatalogUpdateBody = {
      title: current.title,
      description: current.description,
      isActive: true,
      capacity: item.stock.total,
      groupIds: current.groupIds.map((id) => numericId(id, "groupId")),
      rotativo: item.stock.rotative,
      requiredForActivity: current.requiredForActivity,
    };

    if (current.type !== null) {
      body.type = current.type;
    }

    return body;
  }
}
