import type { Attendance } from "../Attendance";
import type { SyncStatus } from "../SyncStatus";
import { User, UserAccount, UserAccountPendingStep, UserMetadata } from "../User";

export interface IUserAccountPendingStepData {
  name: string;
  status: string;
  condition: string;
}

export interface IUserAccountData {
  id: number;
  organizationId: string;
  userId: string | null;
  profileId: number | null;
  profileGuestId: string | null;
  customId: string | null;
  status: string;
  isOwner: boolean;
  role: string;
  pendingSteps: IUserAccountPendingStepData[];
}

export interface IUserMetadataData {
  integrationId: string | null;
  sync: SyncStatus;
  syncError: string | null;
  syncHash: string | null;
  syncedAt: string | null;
  version: number | null;
  account: IUserAccountData | null;
}

export interface IUserData {
  id: string;
  name: string;
  pronoun: string;
  email: string;
  metadata: IUserMetadataData;
}

// F11
export class UserMapper {
  static fromData(data: IUserData, attendances: Attendance[]): User {
    const { metadata } = data;
    const account = metadata.account ? UserMapper.toAccount(metadata.account) : null;
    const userMetadata = new UserMetadata(
      metadata.integrationId,
      metadata.sync,
      metadata.syncError,
      metadata.syncHash,
      metadata.syncedAt,
      metadata.version,
      account,
    );

    return new User(data.id, data.name, data.pronoun, data.email, attendances, userMetadata);
  }

  static toAccount(account: IUserAccountData): UserAccount {
    const pendingSteps = account.pendingSteps.map((step) => new UserAccountPendingStep(step.name, step.status, step.condition));

    return new UserAccount(
      account.id,
      account.organizationId,
      account.userId,
      account.profileId,
      account.profileGuestId,
      account.customId,
      account.status,
      account.isOwner,
      account.role,
      pendingSteps,
    );
  }
}
