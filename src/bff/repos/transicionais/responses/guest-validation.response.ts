import { z } from "zod";
import { Attendance, AttendanceAnswer, AttendanceMetadata } from "../../../domain/Attendance";
import {
  EventCatalog,
  EventCatalogMetadata,
  EventCatalogStock,
  EventCatalogType,
  EventGroup,
  EventGroupMetadata,
} from "../../../domain/Event";
import { UserMapper } from "../../../domain/mappers/UserMapper";
import { SyncStatus } from "../../../domain/SyncStatus";
import type { User, UserAccount } from "../../../domain/User";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { ValidationAnswer } from "../requests/validation-change.request";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "findGuestValidation";

// item de GET v2/manager-validations/guests?validationId={id} (ou ?profileGuestId={id})
const GuestValidationSchema = z.object({
  validationId: z.number().int(),
  profileGuestId: TransicionaisIdSchema,
  userId: z.string().nullable().default(null),
  profileName: z.string(),
  email: z.string(),
  answer: z.enum(ValidationAnswer),
  groupId: TransicionaisIdSchema.nullable(),
  groupName: z.string().nullable().default(null).transform((name) => name ?? ""),
  supportTypeIds: z.array(TransicionaisIdSchema).default([]),
  configDayId: z.number().int(),
  answeredAt: z.string().nullable().default(null),
  hash: z.string().min(1).nullable().default(null),
});

const GuestValidationPageSchema = z.object({ content: z.array(GuestValidationSchema) });

type IGuestValidation = z.infer<typeof GuestValidationSchema>;

export class GuestValidationResponse {
  static toDomain(raw: unknown, fetchedAt: string): User | null {
    const page = parseResponse(GuestValidationPageSchema, raw, InfraSource.Transicionais, OPERATION);
    const [validation] = page.content;

    if (!validation) {
      return null;
    }

    return InvalidResponseError.guard(InfraSource.Transicionais, OPERATION, () => {
      const attendance = GuestValidationResponse.toAttendance(validation, fetchedAt);

      return GuestValidationResponse.toUser(validation, fetchedAt, [attendance], null);
    });
  }

  static toGuest(raw: unknown, fetchedAt: string, account: UserAccount): User | null {
    const page = parseResponse(GuestValidationPageSchema, raw, InfraSource.Transicionais, OPERATION);
    const [validation] = page.content;

    if (!validation) {
      return null;
    }

    return InvalidResponseError.guard(InfraSource.Transicionais, OPERATION, () =>
      GuestValidationResponse.toUser(validation, fetchedAt, [], account),
    );
  }

  private static toUser(
    validation: IGuestValidation,
    fetchedAt: string,
    attendances: Attendance[],
    account: UserAccount | null,
  ): User {
    const metadata = {
      integrationId: validation.userId,
      sync: SyncStatus.Synced,
      syncError: null,
      syncHash: null,
      syncedAt: fetchedAt,
      version: null,
      account: account ? account.toJson() : null,
    };
    const email = validation.email.toLowerCase();

    return UserMapper.fromData({ id: "", name: validation.profileName, pronoun: "", email, metadata }, attendances);
  }

  private static toAttendance(validation: IGuestValidation, fetchedAt: string): Attendance {
    const going = validation.answer === ValidationAnswer.Attending;
    const answer = going ? AttendanceAnswer.Going : AttendanceAnswer.NotGoing;
    const group = going ? GuestValidationResponse.toGroup(validation) : null;
    const catalog = going ? validation.supportTypeIds.map((id) => GuestValidationResponse.toCatalog(id)) : [];
    const createdAt = validation.answeredAt ?? fetchedAt;
    const metadata = new AttendanceMetadata(
      "",
      answer,
      SyncStatus.Synced,
      null,
      validation.hash,
      fetchedAt,
      "",
      validation.validationId,
      null,
    );

    return new Attendance(String(validation.configDayId), "", group, catalog, createdAt, metadata);
  }

  private static toGroup(validation: IGuestValidation): EventGroup | null {
    if (validation.groupId === null) {
      return null;
    }

    const metadata = new EventGroupMetadata(true, null);

    return new EventGroup(validation.groupId, validation.groupName, metadata);
  }

  private static toCatalog(id: string): EventCatalog {
    const stock = new EventCatalogStock();
    const metadata = new EventCatalogMetadata([], EventCatalogType.Accessory);

    return new EventCatalog(id, "", stock, metadata);
  }
}
