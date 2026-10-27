import type { EventCatalog, EventGroup, Event } from "./Event";
import type { SyncStatus } from "./SyncStatus";

// a resposta da pessoa ao encontro
export enum AttendanceAnswer {
  Going = "vou",
  NotGoing = "nao-vou",
}

// o contrato geral da Presença que o Hormônios precisa: o que fica no Supabase e o que o repo traduz
// para o Transicionais. Na raiz, o que a tela usa; em metadata, o resto
export class Attendance {
  constructor(
    readonly event: Event | string,
    readonly id: string, // uuid do Supabase
    readonly eventGroup: EventGroup | null,
    readonly catalog: EventCatalog[],
    readonly createdAt: string,
    readonly metadata: AttendanceMetadata,
  ) {}

  toJson() {
    return {
      id: this.id,
      eventId: typeof this.event === "string" ? this.event : this.event.id,
      groupId: this.eventGroup?.id,
      supportIds: this.catalog.map((c) => c.id),
      createdAt: this.createdAt,
      metadata: this.metadata.toJson(),
    };
  }
}

// tudo que não é utilizado na tela do Hormônios
export class AttendanceMetadata {
  constructor(
    readonly deviceId: string, // hg_device: quem pode desfazer
    readonly answer: AttendanceAnswer,
    readonly sync: SyncStatus,
    readonly syncError: string | null, // o motivo da recusa; só quando REJECTED
    readonly syncHash: string | null, // md5 da presença no Transicionais
    readonly syncedAt: string | null, // ISO do último envio
    readonly userId: string,
    readonly integrationId: number | null, // D7
    readonly version: number | null,
  ) {}

  toJson() {
    return {
      userId: this.userId,
      integrationId: this.integrationId,
      version: this.version,
      deviceId: this.deviceId,
      answer: this.answer,
      sync: this.sync,
      syncError: this.syncError,
      syncHash: this.syncHash,
      syncedAt: this.syncedAt,
    };
  }
}
