import type { IWebhookDeliveryData } from "../../../interfaces/hormonios";

// linha de hg_webhook_deliveries (insert ... on conflict do nothing)
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
export interface IRegisterWebhookDeliveryBody {
  delivery_id: string;
  type: string;
}

/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class RegisterWebhookDeliveryRequest {
  static fromDomain(data: IWebhookDeliveryData): IRegisterWebhookDeliveryBody {
    return { delivery_id: data.deliveryId, type: data.type };
  }
}
