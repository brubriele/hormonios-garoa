import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireCron } from "../../src/serve-utils/http/cron-auth";
import { handle } from "../../src/serve-utils/http/handle";
import { HormoniosRepository } from "../../src/serve-utils/repos/supabase/HormoniosRepository";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { type IJobInput, JobUsecase } from "../../src/serve-utils/usecases/job/JobUsecase";

export const GET = handle(async (request) => {
  await requireCron(request);

  const entity = new URL(request.url).searchParams.get("type") as IJobInput["entity"];
  const httpClient = new HttpClient();
  const transicionaisRepo = new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient));
  const usecase = new JobUsecase(transicionaisRepo, new HormoniosRepository(new SupabaseClient()));
  const items = await usecase.execute({ entity });

  return { body: items.map((item) => item.toJson()) };
});
