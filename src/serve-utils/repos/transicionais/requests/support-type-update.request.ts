import type { SupportType, SupportTypeKind } from "../../../models/support-type";
import { numericId } from "../transicionais-id";

// corpo do PUT v2/manager-support-types/{id} (SupportTypeUpdateRequest): sempre inteiro, porque
// groupIds omitido faria a assistência valer para a organização inteira (D26)
export interface ISupportTypeUpdateBody {
  title: string;
  description: string | null;
  isActive: boolean;
  capacity: number | null;
  groupIds: number[];
  rotativo: boolean;
  requiredForActivity: boolean;
  type?: SupportTypeKind; // só se o GET trouxe (fora do contrato local, D23)
}

export class SupportTypeUpdateRequest {
  static fromDomain(supportType: SupportType): ISupportTypeUpdateBody {
    const body: ISupportTypeUpdateBody = {
      title: supportType.title,
      description: supportType.description,
      isActive: supportType.active,
      capacity: supportType.capacity,
      groupIds: supportType.groupIds.map((id) => numericId(id, "groupId")),
      rotativo: supportType.rotativo,
      requiredForActivity: supportType.requiredForActivity,
    };

    if (supportType.kind !== null) {
      body.type = supportType.kind;
    }

    return body;
  }
}
