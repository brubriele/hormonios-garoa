import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { NewEventUsecase } from "../../src/serve-utils/usecases/new-event";

export const POST = handle(async (request) => {
  await requireAdmin(request);

  const usecase = new NewEventUsecase(new HormoniosRepo(new SupabaseClient()));

  return { body: await usecase.execute() };
});
