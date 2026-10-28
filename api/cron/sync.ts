import { Envolviment } from "../../src/serve-utils/envolviment/Envolviment";
import { requireCron } from "../../src/serve-utils/http/cron-auth";
import { handle } from "../../src/serve-utils/http/handle";
import { type IJobInput, JobUsecase } from "../../src/serve-utils/usecases/job/JobUsecase";

export const GET = handle(async (request) => {
  await requireCron(request);

  const url = new URL(request.url);
  const entity = url.searchParams.get("type") as IJobInput["entity"];
  const jobUsecase = Envolviment.make<JobUsecase>(JobUsecase.token);
  const items = await jobUsecase.execute({ entity });

  return { body: items.map((item) => item.toJson()) };
});
