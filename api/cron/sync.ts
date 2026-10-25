import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireCron } from "../../src/serve-utils/http/cron-auth";
import { handle } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { SyncPendingAttendancesUsecase } from "../../src/serve-utils/usecases/sync-pending-attendances";

export const GET = handle(async (request) => {
  await requireCron(request);

  const httpClient = new HttpClient();
  const usecase = new SyncPendingAttendancesUsecase(
    new HormoniosRepo(new SupabaseClient()),
    new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient)),
  );

  return { body: await usecase.execute() };
});
