import { z } from "zod";
import type { Attendance } from "../../domain/Attendance";
import type { Event } from "../../domain/Event";
import { Job, JobEntity } from "../../domain/Job";
import type { User } from "../../domain/User";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";
import { AttendanceJobUsecase } from "./AttendanceJobUsecase";
import { EventJobUsecase } from "./EventJobUsecase";
import { UserJobUsecase } from "./UserJobUsecase";

const logger = createLogger("JobUsecase", LogContext.Job);

const JobInputSchema = z.object({
  entity: z.enum(JobEntity),
});

type IJobData = z.infer<typeof JobInputSchema>;

export type IJobInput = z.input<typeof JobInputSchema>;

export class JobUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: IJobInput): Promise<Event[] | User[] | Attendance[]> {
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

  private async _execute(input: IJobInput): Promise<Event[] | User[] | Attendance[]> {
    logger.track("processing job");

    const data = this.validateInput(input);
    const job = new Job(data.entity);

    if (job.entity === JobEntity.Event) {
      const usecase = new EventJobUsecase(this.transicionaisRepo, this.hormoniosRepository);

      return usecase.execute(job);
    }

    if (job.entity === JobEntity.User) {
      const usecase = new UserJobUsecase(this.transicionaisRepo, this.hormoniosRepository);

      return usecase.execute(job);
    }

    const usecase = new AttendanceJobUsecase(this.transicionaisRepo, this.hormoniosRepository);

    return usecase.execute(job);
  }

  private validateInput(input: IJobInput): IJobData {
    return validateSchema(JobInputSchema, input);
  }
}
