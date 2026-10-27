import { z } from "zod";
import { type Attendance, AttendanceAnswer } from "../../domain/Attendance";
import { type Event, EventCatalogType, type EventGroup } from "../../domain/Event";
import { ErrorCtx, IntegrationEntity, IntegrationStatus } from "../../domain/IntegrationStatus";
import { AttendanceMapper, type IAttendanceData } from "../../domain/mappers/AttendanceMapper";
import { type IUserData, UserMapper } from "../../domain/mappers/UserMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import type { User } from "../../domain/User";
import {
  AccessorySoldOutError,
  AlreadyReservedError,
  AppError,
  BookingClosedError,
  InvalidParameterError,
  NotFoundError,
  SoldOutError,
  UpstreamUnavailableError,
} from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger } from "../../lib/logger";
import { NonBlankSchema, UuidSchema, validateSchema } from "../../lib/schema";
import { toErrorCtx } from "../../lib/upstream";
import type { CreatingOrUpdateUserUsecase } from "./CreatingOrUpdateUserUsecase";
import type { FindingUserUsecase } from "./FindingUserUsecase";

const logger = createLogger("CreatingOrUpdatingAttendanceUsecase");

const CreatingOrUpdatingAttendanceInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    name: NonBlankSchema,
    pronoun: NonBlankSchema,
    answer: z.enum(AttendanceAnswer),
    groupId: NonBlankSchema.nullable(),
    supportIds: z.array(NonBlankSchema),
    deviceId: UuidSchema,
  })
  .refine((input) => input.groupId !== null || input.supportIds.length === 0, {
    path: ["supportIds"],
    message: "must be empty without groupId",
  })
  .refine((input) => input.answer === AttendanceAnswer.Going || input.groupId === null, {
    path: ["groupId"],
    message: "must be null when not going",
  });

type ICreatingOrUpdatingAttendanceData = z.infer<typeof CreatingOrUpdatingAttendanceInputSchema>;

export interface ICreatingOrUpdatingAttendanceBody {
  email: string;
  name: string;
  pronoun: string;
  answer: AttendanceAnswer;
  groupId: string | null;
  supportIds: string[];
}

export interface ICreatingOrUpdatingAttendanceInput extends ICreatingOrUpdatingAttendanceBody {
  deviceId: string;
}

export class CreatingOrUpdatingAttendanceUsecase {
  constructor(
    private readonly hormoniosRepository: IHormoniosRepository,
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly creatingOrUpdateUserUsecase: CreatingOrUpdateUserUsecase,
    private readonly findingUserUsecase: FindingUserUsecase,
  ) {}

  async execute(input: ICreatingOrUpdatingAttendanceInput): Promise<User> {
    try {
      return await this._execute(input);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // F7, F8
  private async _execute(input: ICreatingOrUpdatingAttendanceInput): Promise<User> {
    const data = this.validateInput(input);
    const event = await this.findCurrentEvent();
    const found = await this.findUser(data.email);
    const user = this.toUser(found, data);
    const attendances = await this.findEventAttendance(event);
    const current = this.findUserAttendance(attendances, user);
    const going = data.answer === AttendanceAnswer.Going;

    if (going) {
      this.validateGoing(event, attendances, user, current, data);
    }

    const savedUser = await this.createOrUpdateUser(user);
    const attendance = this.toAttendance(event, savedUser, current, data);
    const savedAttendance = await this.createOrUpdateAttendance(attendance, event);
    const syncedAttendance = await this.sync(savedUser, savedAttendance, event);
    const savedUserData = savedUser.toJson();

    return UserMapper.fromData(savedUserData, [syncedAttendance]);
  }

  private validateInput(input: ICreatingOrUpdatingAttendanceInput): ICreatingOrUpdatingAttendanceData {
    return validateSchema(CreatingOrUpdatingAttendanceInputSchema, input);
  }

  // D2
  private async findCurrentEvent(): Promise<Event> {
    const event = await this.hormoniosRepository.findCurrentEvent();

    if (!event) {
      throw new NotFoundError("Event Not Found");
    }

    return event;
  }

  private async findUser(email: string): Promise<User | null> {
    return this.findingUserUsecase.execute({ email });
  }

  private toUser(found: User | null, data: ICreatingOrUpdatingAttendanceData): User {
    if (!found) {
      const id = globalThis.crypto.randomUUID();
      const userData: IUserData = {
        id,
        name: data.name,
        pronoun: data.pronoun,
        email: data.email,
        metadata: { integrationId: null, sync: SyncStatus.Pending, syncError: null, syncHash: null, syncedAt: null },
      };

      return UserMapper.fromData(userData, []);
    }

    const metadata = found.metadata;
    const userData: IUserData = {
      id: found.id,
      name: data.name,
      pronoun: data.pronoun,
      email: found.email,
      metadata: {
        integrationId: metadata.integrationId,
        sync: SyncStatus.Pending,
        syncError: null,
        syncHash: metadata.syncHash,
        syncedAt: metadata.syncedAt,
      },
    };

    return UserMapper.fromData(userData, []);
  }

  // D16
  private findUserAttendance(attendances: Attendance[], user: User): Attendance | null {
    const attendance = attendances.find((item) => item.metadata.userId === user.id);

    return attendance ?? null;
  }

  private validateGoing(
    event: Event,
    attendances: Attendance[],
    user: User,
    current: Attendance | null,
    data: ICreatingOrUpdatingAttendanceData,
  ): void {
    this.validateBookingOpen(event);

    const others = this.filterOthers(attendances, user);
    const counted = event.withAttendances(others, true);
    const wasGoing = this.isGoing(current);

    if (!wasGoing) {
      this.validateTotalVacancies(counted);
    }

    if (data.groupId === null) {
      return;
    }

    const group = this.findGroup(event, data.groupId);
    const supportIds = this.uniqueSupportIds(data.supportIds);

    this.validateSupportIds(event, group, supportIds);
    this.validateNotReserved(current, group);
    this.validateInstrumentStock(counted, group);
    this.validateAccessoryStock(counted, supportIds);
    this.validateGroupCapacity(counted, group);
  }

  private validateBookingOpen(event: Event): void {
    if (!event.bookingOpen) {
      throw new BookingClosedError("Booking is closed");
    }
  }

  private findGroup(event: Event, groupId: string): EventGroup {
    const group = event.groups.find((item) => item.id === groupId);

    if (!group || !group.metadata.active) {
      throw new InvalidParameterError("Field groupId is invalid");
    }

    return group;
  }

  private uniqueSupportIds(supportIds: string[]): string[] {
    const unique = new Set(supportIds);

    return [...unique];
  }

  private validateSupportIds(event: Event, group: EventGroup, supportIds: string[]): void {
    for (const supportId of supportIds) {
      const item = event.catalog.find((entry) => entry.id === supportId);

      if (!item || item.metadata.type !== EventCatalogType.Accessory) {
        throw new InvalidParameterError("Field supportIds is invalid");
      }

      const groupIds = item.metadata.groupIds;
      const allowed = groupIds.length === 0 || groupIds.includes(group.id);

      if (!allowed) {
        throw new InvalidParameterError("Field supportIds is invalid");
      }
    }
  }

  private isGoing(attendance: Attendance | null): boolean {
    if (!attendance) {
      return false;
    }

    const going = attendance.metadata.answer === AttendanceAnswer.Going;
    const rejected = attendance.metadata.sync === SyncStatus.Rejected;

    return going && !rejected;
  }

  private validateNotReserved(current: Attendance | null, group: EventGroup): void {
    const wasGoing = this.isGoing(current);
    const currentGroup = current ? current.eventGroup : null;

    if (!wasGoing || currentGroup === null) {
      return;
    }

    if (currentGroup.id !== group.id) {
      throw new AlreadyReservedError("User already reserved");
    }
  }

  private async findEventAttendance(event: Event): Promise<Attendance[]> {
    return this.hormoniosRepository.findEventAttendance(event);
  }

  private filterOthers(attendances: Attendance[], user: User): Attendance[] {
    return attendances.filter((attendance) => attendance.metadata.userId !== user.id);
  }

  private validateInstrumentStock(counted: Event, group: EventGroup): void {
    const instrument = counted.catalog.find(
      (item) => item.metadata.type === EventCatalogType.Instrument && item.metadata.groupIds.includes(group.id),
    );

    if (instrument && instrument.stock.free === 0) {
      throw new SoldOutError(`Catalog ${instrument.id} is sold out`);
    }
  }

  private validateAccessoryStock(counted: Event, supportIds: string[]): void {
    const accessories = counted.catalog.filter((item) => supportIds.includes(item.id));
    const soldOut = accessories.find((item) => item.stock.free === 0);

    if (soldOut) {
      throw new AccessorySoldOutError(`Catalog ${soldOut.id} is sold out`);
    }
  }

  private validateGroupCapacity(counted: Event, group: EventGroup): void {
    const countedGroup = counted.groups.find((item) => item.id === group.id);

    if (countedGroup && countedGroup.capacity === 0) {
      throw new SoldOutError(`Group ${group.id} is sold out`);
    }
  }

  private validateTotalVacancies(counted: Event): void {
    const totalVacancies = counted.metadata.description.totalVacancies;

    if (totalVacancies === null) {
      return;
    }

    if (counted.goingCount >= totalVacancies) {
      throw new SoldOutError("Event is sold out");
    }
  }

  private async createOrUpdateUser(user: User): Promise<User> {
    return this.creatingOrUpdateUserUsecase.execute(user);
  }

  // F8
  private toAttendance(event: Event, user: User, current: Attendance | null, data: ICreatingOrUpdatingAttendanceData): Attendance {
    const id = current ? current.id : globalThis.crypto.randomUUID();
    const createdAt = current ? current.createdAt : new Date().toISOString();
    const currentMetadata = current ? current.metadata : null;
    const supportIds = this.uniqueSupportIds(data.supportIds);
    const attendanceData: IAttendanceData = {
      id,
      eventId: event.id,
      groupId: data.groupId,
      supportIds,
      createdAt,
      metadata: {
        userId: user.id,
        integrationId: currentMetadata ? currentMetadata.integrationId : null,
        deviceId: data.deviceId,
        answer: data.answer,
        sync: SyncStatus.Pending,
        syncError: null,
        syncHash: currentMetadata ? currentMetadata.syncHash : null,
        syncedAt: currentMetadata ? currentMetadata.syncedAt : null,
      },
    };

    return AttendanceMapper.fromData(attendanceData, event);
  }

  private async createOrUpdateAttendance(attendance: Attendance, event: Event): Promise<Attendance> {
    return this.hormoniosRepository.createOrUpdateAttendance(attendance, event);
  }

  private async sync(user: User, attendance: Attendance, event: Event): Promise<Attendance> {
    const shouldSync = this.shouldSync(attendance);

    if (!shouldSync) {
      return attendance;
    }

    const now = new Date();
    const integrationStatus = await this.findIntegrationStatus(attendance, now);
    const ready = user.metadata.integrationId !== null && event.metadata.transicionaisDayId !== null;

    if (!ready) {
      const errorCtx = new ErrorCtx(0, null, null, "User or event is not integrated");
      const pending = integrationStatus.pending(errorCtx, now);

      return this.saveFailure(attendance, pending, event);
    }

    try {
      const userData = user.toJson();
      const userWithAttendance = UserMapper.fromData(userData, [attendance]);

      await this.transicionaisRepo.createAttendance(userWithAttendance);

      return await this.saveSynced(attendance, integrationStatus, event, now);
    } catch (error) {
      const failed = this.toFailedStatus(integrationStatus, error, now);

      return this.saveFailure(attendance, failed, event);
    }
  }

  private shouldSync(attendance: Attendance): boolean {
    const { sync } = attendance.metadata;

    return sync !== SyncStatus.Synced && sync !== SyncStatus.ManualRetry;
  }

  private async findIntegrationStatus(attendance: Attendance, now: Date): Promise<IntegrationStatus> {
    const found = await this.hormoniosRepository.findIntegrationStatus(IntegrationEntity.Attendance, attendance.id);

    return found ?? IntegrationStatus.create(IntegrationEntity.Attendance, attendance.id, now);
  }

  private toFailedStatus(integrationStatus: IntegrationStatus, error: unknown, now: Date): IntegrationStatus {
    const errorCtx = toErrorCtx(error);

    if (error instanceof UpstreamUnavailableError) {
      return integrationStatus.pending(errorCtx, now);
    }

    logger.error({ err: error, attendanceId: integrationStatus.entityId }, "attendance rejected by Transicionais");

    return integrationStatus.manualRetry(errorCtx, now);
  }

  private async saveSynced(attendance: Attendance, integrationStatus: IntegrationStatus, event: Event, now: Date): Promise<Attendance> {
    const syncedAt = now.toISOString();
    const synced = this.withSync(attendance, SyncStatus.Synced, null, syncedAt, event);
    const status = integrationStatus.synced(now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(status);

    return this.createOrUpdateAttendance(synced, event);
  }

  private async saveFailure(attendance: Attendance, integrationStatus: IntegrationStatus, event: Event): Promise<Attendance> {
    const errorCtx = integrationStatus.errorCtx;
    const syncError = errorCtx ? errorCtx.key ?? errorCtx.message : null;
    const failed = this.withSync(attendance, integrationStatus.status, syncError, attendance.metadata.syncedAt, event);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(integrationStatus);

    return this.createOrUpdateAttendance(failed, event);
  }

  private withSync(
    attendance: Attendance,
    sync: SyncStatus,
    syncError: string | null,
    syncedAt: string | null,
    event: Event,
  ): Attendance {
    const json = attendance.toJson();
    const groupId = json.groupId ?? null;
    const metadata = { ...json.metadata, sync, syncError, syncedAt };

    return AttendanceMapper.fromData({ ...json, groupId, metadata }, event);
  }
}
