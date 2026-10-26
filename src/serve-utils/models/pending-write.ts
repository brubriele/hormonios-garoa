import type { UUID } from "../interfaces/uuid";

// o que a Produção deixou para o cron enviar ao Transicionais (hg_pending_writes, D51–D53)
export enum PendingWriteKind {
  SupportCapacity = "SUPPORT_CAPACITY", // o estoque de uma assistência
  NextEvent = "NEXT_EVENT", // o "Encerrar ensaio": o próximo nasceu só no local
}

// como gravar o resultado de um envio (função marcar_escrita)
export enum PendingWriteMode {
  Synced = "SYNCED",
  Rejected = "REJECTED", // o Transicionais recusou a regra (D52)
  ManualRetry = "MANUAL_RETRY", // 400, 409 ou 422: sai do cron até o ajuste manual (D50)
  Backoff = "BACKOFF", // fica PENDING, attempts + 1, e volta mais tarde
}

// uma escrita pendente: o id e o updated_at são a trava do envio, como nas reservas
export abstract class PendingWrite {
  abstract readonly kind: PendingWriteKind;
  abstract readonly id: UUID;
  abstract readonly updatedAt: string;
}
