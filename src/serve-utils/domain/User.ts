import type { Attendance } from "./Attendance";
import type { SyncStatus } from "./SyncStatus";

// o contrato geral da pessoa que o Hormônios precisa. Na raiz, o que a tela usa
export class User {
  constructor(
    readonly id: string, // uuid do Supabase
    readonly name: string,
    readonly pronoun: string,
    readonly email: string, // único: liga a pessoa ao Transicionais
    readonly attendances: Attendance[], // D4, D16
    readonly metadata: UserMetadata,
  ) {}

  // a ligação com a presença fica na Attendance (metadata.userId)
  toJson() {
    return {
      id: this.id,
      name: this.name,
      pronoun: this.pronoun,
      email: this.email,
      metadata: this.metadata.toJson(),
    };
  }
}

// D6, D7
export class UserMetadata {
  constructor(
    readonly integrationId: number | null,
    readonly sync: SyncStatus,
    readonly syncError: string | null,
    readonly syncHash: string | null,
    readonly syncedAt: string | null,
  ) {}

  toJson() {
    return {
      integrationId: this.integrationId,
      sync: this.sync,
      syncError: this.syncError,
      syncHash: this.syncHash,
      syncedAt: this.syncedAt,
    };
  }
}
