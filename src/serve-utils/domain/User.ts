import type { Attendance } from "./Attendance";
import type { SyncStatus } from "./SyncStatus";

// o contrato geral da pessoa que o Hormônios precisa. Na raiz, o que a tela usa
export class User {
  readonly anonymizedName: string;
  readonly anonymizedEmail: string;
  readonly account: UserAccount | null;

  constructor(
    readonly id: string, // uuid do Supabase
    readonly name: string,
    readonly pronoun: string,
    readonly email: string, // único: liga a pessoa ao Transicionais
    readonly attendances: Attendance[], // D4, D16
    readonly metadata: UserMetadata,
  ) {
    this.anonymizedName = this.anonymizeName();
    this.anonymizedEmail = this.anonymizeEmail();
    this.account = metadata.account;
  }

  private anonymizeName(): string {
    const [first = "", ...rest] = this.name.trim().split(/\s+/);
    const others = rest.map((word) => (word.length <= 3 ? word : `${word[0]}*****${word.slice(-2)}`));

    return [first, ...others].join(" ");
  }

  private anonymizeEmail(): string {
    const at = this.email.lastIndexOf("@");

    if (at <= 0) {
      return this.email;
    }

    const local = this.email.slice(0, at);
    const domain = this.email.slice(at);
    const masked = local.length <= 4 ? `${local[0]}***` : `${local.slice(0, 2)}***${local.slice(-2)}`;

    return `${masked}${domain}`;
  }

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
    readonly integrationId: string | null, // userId da conta no Transicionais
    readonly sync: SyncStatus,
    readonly syncError: string | null,
    readonly syncHash: string | null,
    readonly syncedAt: string | null,
    readonly version: number | null,
    readonly account: UserAccount | null,
  ) {}

  toJson() {
    return {
      integrationId: this.integrationId,
      sync: this.sync,
      syncError: this.syncError,
      syncHash: this.syncHash,
      syncedAt: this.syncedAt,
      version: this.version,
      account: this.account ? this.account.toJson() : null,
    };
  }
}

export class UserAccountPendingStep {
  constructor(
    readonly name: string,
    readonly status: string,
    readonly condition: string,
  ) {}

  toJson() {
    return { name: this.name, status: this.status, condition: this.condition };
  }
}

export class UserAccount {
  constructor(
    readonly id: number,
    readonly organizationId: string,
    readonly userId: string | null,
    readonly profileId: number | null,
    readonly profileGuestId: string | null,
    readonly customId: string | null,
    readonly status: string,
    readonly isOwner: boolean,
    readonly role: string,
    readonly pendingSteps: UserAccountPendingStep[],
  ) {}

  toJson() {
    return {
      id: this.id,
      organizationId: this.organizationId,
      userId: this.userId,
      profileId: this.profileId,
      profileGuestId: this.profileGuestId,
      customId: this.customId,
      status: this.status,
      isOwner: this.isOwner,
      role: this.role,
      pendingSteps: this.pendingSteps.map((step) => step.toJson()),
    };
  }
}
