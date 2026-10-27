import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { getOrCreateDevice } from "../../src/serve-utils/http/device";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { createUserCookie } from "../../src/serve-utils/http/user-cookie";
import { HormoniosRepository } from "../../src/serve-utils/repos/supabase/HormoniosRepository";
import {
  CreatingOrUpdatingAttendanceUsecase,
  type ICreatingOrUpdatingAttendanceBody,
} from "../../src/serve-utils/usecases/booking/CreatingOrUpdatingAttendanceUsecase";

// D15, F7, F8
export const POST = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await readJson<ICreatingOrUpdatingAttendanceBody>(request);
  const usecase = new CreatingOrUpdatingAttendanceUsecase(new HormoniosRepository(new SupabaseClient()));
  const user = await usecase.execute({ ...body, deviceId });
  const attendances = user.attendances.map((attendance) => attendance.toJson());
  const userCookie = createUserCookie(user.id);
  const cookies = cookie ? [userCookie, cookie] : [userCookie];

  return { status: 200, body: { ...user.toJson(), attendances }, cookies };
});
