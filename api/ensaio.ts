import { SupabaseClient } from "../src/serve-utils/clients/supabase-client";
import { handle } from "../src/serve-utils/http/handle";
import { HormoniosRepo } from "../src/serve-utils/repos/supabase/repo";
import { GetEventUsecase } from "../src/serve-utils/usecases/get-event";

export const GET = handle(async () => {
  const usecase = new GetEventUsecase(new HormoniosRepo(new SupabaseClient()));

  return { body: await usecase.execute() };
});
