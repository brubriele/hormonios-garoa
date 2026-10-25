import { HttpClient } from "../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../src/serve-utils/clients/supabase-client";
import { handle } from "../src/serve-utils/http/handle";
import { HormoniosRepo } from "../src/serve-utils/repos/supabase/repo";
import { TransicionaisRepo } from "../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../src/serve-utils/repos/transicionais/session";
import { GetEventUsecase } from "../src/serve-utils/usecases/get-event";

export const GET = handle(async () => {
  const httpClient = new HttpClient();
  const usecase = new GetEventUsecase(
    new HormoniosRepo(new SupabaseClient()),
    new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient)),
  );

  return { body: await usecase.execute() };
});
