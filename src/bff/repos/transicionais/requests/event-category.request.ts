import { numericId } from "../transicionais-id";

// corpo do PUT v2/manager-events/details/{id}/category (sem version, como no exemplo do contrato; D16)
export interface IEventCategoryBody {
  categoryId: number;
}

export class EventCategoryRequest {
  static fromDomain(categoryId: string): IEventCategoryBody {
    return { categoryId: numericId(categoryId, "categoryId") };
  }
}
