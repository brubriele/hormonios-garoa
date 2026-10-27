import { SupabaseClient } from "../src/serve-utils/clients/supabase-client";
import { handle } from "../src/serve-utils/http/handle";
import { HormoniosRepository } from "../src/serve-utils/repos/supabase/HormoniosRepository";
import { FindingPublicEventUsecase } from "../src/serve-utils/usecases/event/FindingPublicEventUsecase";

export const GET = handle(async () => {
  const usecase = new FindingPublicEventUsecase(new HormoniosRepository(new SupabaseClient()));
  const event = await usecase.execute();

  return { body: event.toJson() };
});
