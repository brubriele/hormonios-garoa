import { z } from "zod";
import { UserMapper } from "../../../domain/mappers/UserMapper";
import type { User } from "../../../domain/User";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "registerGuest";

// resposta do POST v2/manager-organization/users (OrganizationUserAccount): convidado traz
// profileGuestId; e-mail de membro traz profileId (D41). Sem nenhum dos dois, a resposta é inválida
const GuestAccountSchema = z
  .object({
    profileGuestId: TransicionaisIdSchema.nullable(),
    profileId: TransicionaisIdSchema.nullable(),
  })
  .refine((account) => (account.profileGuestId === null) !== (account.profileId === null), {
    message: "expected profileGuestId or profileId",
  });

export class GuestAccountResponse {
  static toDomain(raw: unknown, user: User): User {
    const account = parseResponse(GuestAccountSchema, raw, InfraSource.Transicionais, OPERATION);
    const guestId = account.profileGuestId;

    if (guestId === null) {
      throw new InvalidResponseError(InfraSource.Transicionais, OPERATION, "member account is not supported");
    }

    const data = user.toJson();
    const metadata = { ...data.metadata, integrationId: guestId };

    return UserMapper.fromData({ ...data, metadata }, user.attendances);
  }
}
