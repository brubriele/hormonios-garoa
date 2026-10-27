import { z } from "zod";
import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import { ErrorCtx, IntegrationEntity, type IntegrationStatus, MAX_ITEMS_PER_JOB } from "../../domain/IntegrationStatus";
import { Job } from "../../domain/Job";
import { AttendanceMapper } from "../../domain/mappers/AttendanceMapper";
import { UserMapper } from "../../domain/mappers/UserMapper";
import { SyncStatus } from "../../domain/SyncStatus";
import type { User } from "../../domain/User";
import { AppError, UpstreamUnavailableError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { toErrorCtx } from "../../lib/upstream";

const logger = createLogger("AttendanceJobUsecase", LogContext.Job);

const AttendanceJobInputSchema = z.instanceof(Job);

export class AttendanceJobUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: Job): Promise<Attendance[]> {
    try {
      return await this._execute(input);
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error);
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: Job): Promise<Attendance[]> {
    logger.track("attendance job started");

    this.validateInput(input);

    const now = new Date();
    const integrationStatuses = await this.findDueIntegrationStatus(now);
    const attendances = await Promise.all(
      integrationStatuses.map((integrationStatus) => this.syncAttendance(integrationStatus, now)),
    );

    return attendances.filter((attendance) => attendance !== null);
  }

  private validateInput(input: Job): Job {
    return validateSchema(AttendanceJobInputSchema, input);
  }

  private async findDueIntegrationStatus(now: Date): Promise<IntegrationStatus[]> {
    return this.hormoniosRepository.findDueIntegrationStatus(IntegrationEntity.Attendance, SyncStatus.Pending, now, MAX_ITEMS_PER_JOB);
  }

  private async syncAttendance(integrationStatus: IntegrationStatus, now: Date): Promise<Attendance | null> {
    try {
      const attendanceId = integrationStatus.entityId;
      const event = await this.hormoniosRepository.findEventByAttendanceId(attendanceId);
      const attendance = event ? await this.hormoniosRepository.findAttendance(attendanceId, event) : null;
      const user = attendance ? await this.hormoniosRepository.findUser(attendance.metadata.userId) : null;

      if (!event || !attendance || !user) {
        await this.saveNotFound(integrationStatus, now);

        return null;
      }

      return await this.sendAttendance(user, attendance, event, integrationStatus, now);
    } catch (error) {
      logger.error({ err: error, hormoniosAttendanceId: integrationStatus.entityId }, "attendance job failed");

      return null;
    }
  }

  private async saveNotFound(integrationStatus: IntegrationStatus, now: Date): Promise<void> {
    const errorCtx = new ErrorCtx(0, null, null, "Attendance, user or event not found");
    const failed = integrationStatus.manualRetry(errorCtx, now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(failed);
  }

  private async sendAttendance(
    user: User,
    attendance: Attendance,
    event: Event,
    integrationStatus: IntegrationStatus,
    now: Date,
  ): Promise<Attendance> {
    const ready = user.metadata.account !== null && event.metadata.transicionaisDayId !== null;

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

  private toFailedStatus(integrationStatus: IntegrationStatus, error: unknown, now: Date): IntegrationStatus {
    const errorCtx = toErrorCtx(error);

    if (error instanceof UpstreamUnavailableError) {
      return integrationStatus.pending(errorCtx, now);
    }

    logger.error({ err: error, hormoniosAttendanceId: integrationStatus.entityId }, "attendance rejected by Transicionais");

    return integrationStatus.manualRetry(errorCtx, now);
  }

  private async saveSynced(attendance: Attendance, integrationStatus: IntegrationStatus, event: Event, now: Date): Promise<Attendance> {
    const syncedAt = now.toISOString();
    const synced = this.withSync(attendance, SyncStatus.Synced, null, syncedAt, event);
    const status = integrationStatus.synced(now);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(status);

    return this.hormoniosRepository.createOrUpdateAttendance(synced, event);
  }

  private async saveFailure(attendance: Attendance, integrationStatus: IntegrationStatus, event: Event): Promise<Attendance> {
    const errorCtx = integrationStatus.errorCtx;
    const syncError = errorCtx ? errorCtx.key ?? errorCtx.message : null;
    const failed = this.withSync(attendance, integrationStatus.status, syncError, attendance.metadata.syncedAt, event);

    await this.hormoniosRepository.createOrUpdateIntegrationStatus(integrationStatus);

    return this.hormoniosRepository.createOrUpdateAttendance(failed, event);
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
