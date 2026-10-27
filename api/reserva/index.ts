import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { getOrCreateDevice } from "../../src/serve-utils/http/device";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { createUserCookie, readUserId } from "../../src/serve-utils/http/user-cookie";
import { HormoniosRepository } from "../../src/serve-utils/repos/supabase/HormoniosRepository";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import {
  CreatingOrUpdatingAttendanceUsecase,
  type ICreatingOrUpdatingAttendanceBody,
} from "../../src/serve-utils/usecases/booking/CreatingOrUpdatingAttendanceUsecase";
import { CreatingOrUpdateUserUsecase } from "../../src/serve-utils/usecases/booking/CreatingOrUpdateUserUsecase";
import { FindingUserUsecase } from "../../src/serve-utils/usecases/booking/FindingUserUsecase";
import { UserResponse } from "../_responses/UserResponse";

// F7
export const POST = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await readJson<ICreatingOrUpdatingAttendanceBody>(request);
  const hormoniosRepository = new HormoniosRepository(new SupabaseClient());
  const httpClient = new HttpClient();
  const transicionaisRepo = new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient));
  const usecase = new CreatingOrUpdatingAttendanceUsecase(
    hormoniosRepository,
    transicionaisRepo,
    new CreatingOrUpdateUserUsecase(hormoniosRepository, transicionaisRepo),
    new FindingUserUsecase(hormoniosRepository),
  );
  const userId = readUserId(request);
  const user = await usecase.execute({ ...body, deviceId, userId });
  const userCookie = createUserCookie(user.id);
  const cookies = cookie ? [userCookie, cookie] : [userCookie];

  return { status: 201, body: UserResponse.fromDomain(user), cookies };
});
