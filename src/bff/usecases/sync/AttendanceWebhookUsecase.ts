import { z } from "zod";
import type { Attendance } from "../../domain/Attendance";
import { type Event, EventCatalogType } from "../../domain/Event";
import { AttendanceMapper } from "../../domain/mappers/AttendanceMapper";
import { UserMapper } from "../../domain/mappers/UserMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import type { User } from "../../domain/User";
import { Webhook, WebhookResult } from "../../domain/Webhook";
import { AppError, NotFoundError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { CreatingOrUpdateUserUsecase } from "../booking/CreatingOrUpdateUserUsecase";

const logger = createLogger("AttendanceWebhookUsecase", LogContext.Sync);

const AttendanceWebhookInputSchema = z.instanceof(Webhook);

export class AttendanceWebhookUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: Webhook): Promise<WebhookResult> {
    try {
      const result = await this._execute(input);

      return result;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error);
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: Webhook): Promise<WebhookResult> {
    logger.track("receiving attendance webhook");

    const webhook = this.validateInput(input);

    try {
      const result = await this.receiveAttendance(webhook);

      return result;
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return new WebhookResult(SyncStatus.Pending, false);
      }

      throw error;
    }
  }

  private validateInput(input: Webhook): Webhook {
    return validateSchema(AttendanceWebhookInputSchema, input);
  }

  private async receiveAttendance(webhook: Webhook): Promise<WebhookResult> {
    const external = await this.findTransicionaisAttendance(webhook.id);
    const [incoming] = external ? external.attendances : [];

    if (!external || !incoming) {
      return new WebhookResult(SyncStatus.Rejected, false);
    }

    const event = await this.findEvent(incoming);

    if (!event) {
      return new WebhookResult(SyncStatus.Rejected, false);
    }

    const user = await this.findOrCreateUser(external);
    const current = await this.findCurrentAttendance(incoming, user, event);
    const changed = !current || this.isChanged(incoming, current);

    if (changed) {
      const attendance = this.toAttendance(incoming, current, user, event);

      await this.hormoniosRepository.createOrUpdateAttendance(attendance, event);
    }

    return new WebhookResult(SyncStatus.Synced, true);
  }

  private async findTransicionaisAttendance(id: number | string): Promise<User | null> {
    const externalId = String(id);

    try {
      const result = await this.transicionaisRepo.findAttendance(externalId);

      return result;
    } catch (error) {
      if (error instanceof NotFoundError) {
        return null;
      }

      throw error;
    }
  }

  private async findEvent(incoming: Attendance): Promise<Event | null> {
    const transicionaisDayId = Number(incoming.event);

    return this.hormoniosRepository.findEvent({ transicionaisDayId });
  }

  private async findOrCreateUser(external: User): Promise<User> {
    const found = await this.findInternalUser(external);

    if (found) {
      return found;
    }

    const json = external.toJson();
    const user = UserMapper.fromData(json, []);
    const usecase = new CreatingOrUpdateUserUsecase(this.hormoniosRepository, this.transicionaisRepo);

    return usecase.execute(user);
  }

  private async findInternalUser(external: User): Promise<User | null> {
    const integrationId = external.metadata.integrationId;

    if (integrationId) {
      const byIntegrationId = await this.hormoniosRepository.findUser({ integrationId });

      if (byIntegrationId) {
        return byIntegrationId;
      }
    }

    return this.hormoniosRepository.findUser({ email: external.email });
  }

  private async findCurrentAttendance(incoming: Attendance, user: User, event: Event): Promise<Attendance | null> {
    const integrationId = incoming.metadata.integrationId;

    if (integrationId !== null) {
      const byIntegrationId = await this.hormoniosRepository.findAttendance({ integrationId, event });

      if (byIntegrationId) {
        return byIntegrationId;
      }
    }

    const attendances = await this.hormoniosRepository.findEventAttendance(event);
    const byUser = attendances.find((attendance) => attendance.metadata.userId === user.id);

    return byUser ?? null;
  }

  private isChanged(incoming: Attendance, current: Attendance): boolean {
    const hashChanged = incoming.metadata.syncHash !== current.metadata.syncHash;
    const older = this.isOlder(incoming.metadata.version, current.metadata.version);

    return hashChanged && !older;
  }

  private isOlder(incoming: number | null, stored: number | null): boolean {
    if (stored === null) {
      return false;
    }

    if (incoming === null) {
      return true;
    }

    return incoming < stored;
  }

  private toAttendance(incoming: Attendance, current: Attendance | null, user: User, event: Event): Attendance {
    const json = incoming.toJson();
    const id = current ? current.id : globalThis.crypto.randomUUID();
    const createdAt = current ? current.createdAt : json.createdAt;
    const deviceId = current ? current.metadata.deviceId : "";
    const groupId = json.groupId ?? null;
    const supportIds = this.filterAccessories(json.supportIds, event);
    const metadata = { ...json.metadata, userId: user.id, deviceId };

    return AttendanceMapper.fromData({ ...json, id, eventId: event.id, groupId, supportIds, createdAt, metadata }, event);
  }

  private filterAccessories(supportIds: string[], event: Event): string[] {
    const accessories = event.catalog.filter((item) => item.metadata.type === EventCatalogType.Accessory);
    const accessoryIds = accessories.map((item) => item.id);

    return supportIds.filter((id) => accessoryIds.includes(id));
  }
}
