import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { getOrCreateDevice } from "../../src/serve-utils/http/device";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { ReserveUsecase, type IReserveInput } from "../../src/serve-utils/usecases/reserve";

export const POST = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await readJson<Omit<IReserveInput, "deviceId">>(request);

  const usecase = new ReserveUsecase(new HormoniosRepo(new SupabaseClient()));

  return {
    status: 201,
    body: await usecase.execute({ ...body, deviceId }),
    cookies: cookie ? [cookie] : [],
  };
});
