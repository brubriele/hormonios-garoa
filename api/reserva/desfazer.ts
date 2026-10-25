import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { clientIp } from "../../src/serve-utils/http/client-ip";
import { getOrCreateDevice } from "../../src/serve-utils/http/device";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import {
  CancelReservationUsecase,
  type ICancelReservationBody,
} from "../../src/serve-utils/usecases/cancel-reservation";

export const POST = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await readJson<ICancelReservationBody>(request);

  const httpClient = new HttpClient();
  const usecase = new CancelReservationUsecase(
    new HormoniosRepo(new SupabaseClient()),
    new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient)),
  );
  await usecase.execute({ ...body, deviceId, ip: clientIp(request) });

  return { cookies: cookie ? [cookie] : [] };
});
