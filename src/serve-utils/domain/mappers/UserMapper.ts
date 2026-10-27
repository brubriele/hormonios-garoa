import type { Attendance } from "../Attendance";
import type { SyncStatus } from "../SyncStatus";
import { User, UserMetadata } from "../User";

export interface IUserMetadataData {
  integrationId: number | null;
  sync: SyncStatus;
  syncError: string | null;
  syncHash: string | null;
  syncedAt: string | null;
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
    const userMetadata = new UserMetadata(
      metadata.integrationId,
      metadata.sync,
      metadata.syncError,
      metadata.syncHash,
      metadata.syncedAt,
    );

    return new User(data.id, data.name, data.pronoun, data.email, attendances, userMetadata);
  }
}
