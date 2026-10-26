import { SupabaseClient } from "../src/serve-utils/clients/supabase-client";
import { getOrCreateDevice } from "../src/serve-utils/http/device";
import { handle } from "../src/serve-utils/http/handle";
import { HormoniosRepo } from "../src/serve-utils/repos/supabase/repo";
import { FindingUserBookingsUsecase } from "../src/serve-utils/usecases/booking/finding-user-bookings";

export const GET = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);

  const usecase = new FindingUserBookingsUsecase(new HormoniosRepo(new SupabaseClient()));

  return { body: await usecase.execute({ deviceId }), cookies: cookie ? [cookie] : [] };
});
