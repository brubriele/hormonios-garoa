import type { Attendance } from "../src/serve-utils/domain/Attendance";
import type { Event } from "../src/serve-utils/domain/Event";
import type { User } from "../src/serve-utils/domain/User";
import { Envolviment } from "../src/serve-utils/envolviment/Envolviment";
import { type IJobInput, JobUsecase } from "../src/serve-utils/usecases/job/JobUsecase";

// spec-5 B1
export async function handler(input: IJobInput): Promise<Event[] | User[] | Attendance[]> {
  const jobUsecase = Envolviment.make<JobUsecase>(JobUsecase.token);
  const items = await jobUsecase.execute(input);

  return items;
}
