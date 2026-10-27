import { z } from "zod";
import { type Attendance, AttendanceAnswer } from "../../domain/Attendance";
import { type Event, EventCatalogType, type EventGroup } from "../../domain/Event";
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
} from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger } from "../../lib/logger";
import { NonBlankSchema, UuidSchema, validateSchema } from "../../lib/schema";

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
  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

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
    const found = await this.findUser(data.email, event);
    const user = this.toUser(found, data);
    const current = this.findUserAttendance(user);
    const going = data.answer === AttendanceAnswer.Going;

    if (going) {
      await this.validateGoing(event, user, current, data);
    }

    const savedUser = await this.createOrUpdateUser(user);
    const attendance = this.toAttendance(event, savedUser, current, data);
    const savedAttendance = await this.createOrUpdateAttendance(attendance, event);
    const savedUserData = savedUser.toJson();

    return UserMapper.fromData(savedUserData, [savedAttendance]);
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

  // D16
  private async findUser(email: string, event: Event): Promise<User | null> {
    return this.hormoniosRepository.findUser(email, event);
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

    return UserMapper.fromData(userData, found.attendances);
  }

  // D16
  private findUserAttendance(user: User): Attendance | null {
    const attendance = user.attendances[0];

    return attendance ?? null;
  }

  private async validateGoing(
    event: Event,
    user: User,
    current: Attendance | null,
    data: ICreatingOrUpdatingAttendanceData,
  ): Promise<void> {
    this.validateBookingOpen(event);

    const attendances = await this.findEventAttendance(event);
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
    return this.hormoniosRepository.createOrUpdateUser(user);
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
}
