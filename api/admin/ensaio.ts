import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { UpdateEventUsecase, type IUpdateEventInput } from "../../src/serve-utils/usecases/update-event";

export const PUT = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IUpdateEventInput>(request);
  const usecase = new UpdateEventUsecase(new HormoniosRepo(new SupabaseClient()));

  return { body: await usecase.execute({ ...body }) };
});
