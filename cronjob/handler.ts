import type { Attendance } from "../src/bff/domain/Attendance";
import type { Event } from "../src/bff/domain/Event";
import type { User } from "../src/bff/domain/User";
import { Envolviment } from "../src/bff/envolviment/Envolviment";
import { type IJobInput, JobUsecase } from "../src/bff/usecases/job/JobUsecase";

// spec-5 B1
export async function handler(input: IJobInput): Promise<Event[] | User[] | Attendance[]> {
  const jobUsecase = Envolviment.make<JobUsecase>(JobUsecase.token);
  const items = await jobUsecase.execute(input);

  return items;
}
