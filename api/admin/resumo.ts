import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { FindingCurrentEventSummaryUsecase } from "../../src/serve-utils/usecases/event/finding-current-event-summary";

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const usecase = new FindingCurrentEventSummaryUsecase(new HormoniosRepo(new SupabaseClient()));

  return { body: await usecase.execute() };
});
