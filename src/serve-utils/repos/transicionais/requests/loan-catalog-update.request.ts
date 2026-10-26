import type { LoanCatalog, LoanCatalogKind } from "../../../models/loan-catalog";
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
  static fromDomain(loanCatalog: LoanCatalog): ILoanCatalogUpdateBody {
    const body: ILoanCatalogUpdateBody = {
      title: loanCatalog.title,
      description: loanCatalog.description,
      isActive: loanCatalog.active,
      capacity: loanCatalog.capacity,
      groupIds: loanCatalog.groupIds.map((id) => numericId(id, "groupId")),
      rotativo: loanCatalog.rotativo,
      requiredForActivity: loanCatalog.requiredForActivity,
    };

    if (loanCatalog.kind !== null) {
      body.type = loanCatalog.kind;
    }

    return body;
  }
}
