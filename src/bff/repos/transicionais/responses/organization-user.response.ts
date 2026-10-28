import { z } from "zod";
import { UserMapper } from "../../../domain/mappers/UserMapper";
import { SyncStatus } from "../../../domain/SyncStatus";
import type { User, UserAccount } from "../../../domain/User";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "findOrganizationUser";

const PendingStepSchema = z.object({
  name: z.string(),
  status: z.string(),
  condition: z.string(),
});

// a conta na organização (OrganizationUserAccount): GET v2/manager-organization/users/{id}?by= e a
// resposta do POST v2/manager-organization/users
const OrganizationUserSchema = z.object({
  id: z.number().int(),
  organizationId: z.string(),
  userId: z.string().nullable(),
  profileId: z.number().int().nullable(),
  profileGuestId: TransicionaisIdSchema.nullable(),
  customId: z.string().nullable(),
  status: z.string(),
  isOwner: z.boolean(),
  role: z.string(),
  pendingSteps: z.array(PendingStepSchema).default([]),
});

export class OrganizationUserResponse {
  static toDomain(raw: unknown, operation = OPERATION): UserAccount {
    const account = parseResponse(OrganizationUserSchema, raw, InfraSource.Transicionais, operation);

    return InvalidResponseError.guard(InfraSource.Transicionais, operation, () => UserMapper.toAccount(account));
  }

  static toUser(account: UserAccount, fetchedAt: string): User {
    const metadata = {
      integrationId: account.userId,
      sync: SyncStatus.Synced,
      syncError: null,
      syncHash: null,
      syncedAt: fetchedAt,
      version: null,
      account: account.toJson(),
    };

    return UserMapper.fromData({ id: "", name: "", pronoun: "", email: "", metadata }, []);
  }
}
