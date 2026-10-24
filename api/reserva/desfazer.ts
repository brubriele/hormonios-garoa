import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { getOrCreateDevice } from "../../src/serve-utils/http/device";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import {
  CancelReservationUsecase,
  type ICancelReservationInput,
} from "../../src/serve-utils/usecases/cancel-reservation";

export const POST = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await readJson<Omit<ICancelReservationInput, "deviceId">>(request);

  const usecase = new CancelReservationUsecase(new HormoniosRepo(new SupabaseClient()));
  await usecase.execute({ ...body, deviceId });

  return { cookies: cookie ? [cookie] : [] };
});
