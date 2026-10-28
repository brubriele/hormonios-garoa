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
import { SyncStatus } from "../../../domain/SyncStatus";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";
import { ValidationAnswer } from "../requests/validation-change.request";
import { TransicionaisIdSchema } from "../transicionais-id";

const OPERATION = "guestPresence";

const GuestPresenceSchema = z.object({
  validationId: z.number().int(),
  email: z.string().nullable(),
  hash: z.string().min(1).nullable().default(null),
  answer: z.enum(ValidationAnswer),
  groupId: TransicionaisIdSchema.nullable(),
  groupName: z.string().nullable().default(null).transform((name) => name ?? ""),
  supportTypeIds: z.array(TransicionaisIdSchema).default([]),
  configDayId: z.number().int(),
  answeredAt: z.string().nullable().default(null),
});

const GuestPresencePageSchema = z.object({ content: z.array(GuestPresenceSchema) });

type IGuestPresence = z.infer<typeof GuestPresenceSchema>;

export class GuestPresenceResponse {
  // spec-4 D1
  static toDomain(raw: unknown, email: string, dayId: number, fetchedAt: string): Attendance | null {
    const page = parseResponse(GuestPresencePageSchema, raw, InfraSource.Transicionais, OPERATION);
    const target = email.toLowerCase();
    const item = page.content.find((presence) => presence.configDayId === dayId && presence.email?.toLowerCase() === target);

    if (!item) {
      return null;
    }

    return InvalidResponseError.guard(InfraSource.Transicionais, OPERATION, () => GuestPresenceResponse.toAttendance(item, fetchedAt));
  }

  // D37
  private static toAttendance(item: IGuestPresence, fetchedAt: string): Attendance {
    const going = item.answer === ValidationAnswer.Attending;
    const answer = going ? AttendanceAnswer.Going : AttendanceAnswer.NotGoing;
    const group = going ? GuestPresenceResponse.toGroup(item) : null;
    const catalog = going ? item.supportTypeIds.map((id) => GuestPresenceResponse.toCatalog(id)) : [];
    const createdAt = item.answeredAt ?? fetchedAt;
    const metadata = new AttendanceMetadata("", answer, SyncStatus.Synced, null, item.hash, fetchedAt, "", item.validationId, null);

    return new Attendance(String(item.configDayId), "", group, catalog, createdAt, metadata);
  }

  private static toGroup(item: IGuestPresence): EventGroup | null {
    if (item.groupId === null) {
      return null;
    }

    const metadata = new EventGroupMetadata(true, null);

    return new EventGroup(item.groupId, item.groupName, metadata);
  }

  private static toCatalog(id: string): EventCatalog {
    const stock = new EventCatalogStock();
    const metadata = new EventCatalogMetadata([], EventCatalogType.Accessory);

    return new EventCatalog(id, "", stock, metadata);
  }
}
