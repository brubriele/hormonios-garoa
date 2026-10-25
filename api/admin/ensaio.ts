import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { UpdateEventUsecase, type IUpdateEventInput } from "../../src/serve-utils/usecases/update-event";

export const PUT = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IUpdateEventInput>(request);
  const httpClient = new HttpClient();
  const usecase = new UpdateEventUsecase(
    new HormoniosRepo(new SupabaseClient()),
    new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient)),
  );

  return { body: await usecase.execute({ ...body }) };
});
