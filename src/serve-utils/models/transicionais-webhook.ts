// tipo de um webhook do Transicionais já traduzido; Other = tipo que o Hormônios não trata (D38)
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
export enum WebhookType {
  EventUpdated = "event.updated",
  ValidationChanged = "validation.changed",
  Other = "other",
}

// resultado de um event.updated (dúvida D35)
export enum EventWebhookStatus {
  Snapshot = "SNAPSHOT", // retrato do encontro atual, pronto para gravar
  OtherEvent = "OTHER_EVENT", // externalId diferente do atual (ou retrato local da fase 1)
  Unmappable = "UNMAPPABLE", // o retrato não deu para mapear: o usecase chama a rotina
}
