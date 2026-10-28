import { Envolviment } from "../../src/serve-utils/envolviment/Envolviment";
import { getOrCreateDevice } from "../../src/serve-utils/http/device";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { createUserCookie, readUserId } from "../../src/serve-utils/http/user-cookie";
import {
  CreatingOrUpdatingAttendanceUsecase,
  type ICreatingOrUpdatingAttendanceBody,
} from "../../src/serve-utils/usecases/booking/CreatingOrUpdatingAttendanceUsecase";
import { UserResponse } from "../_responses/UserResponse";

// F7
export const POST = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await readJson<ICreatingOrUpdatingAttendanceBody>(request);
  const creatingOrUpdatingAttendanceUsecase = await Envolviment.make<CreatingOrUpdatingAttendanceUsecase>(
    CreatingOrUpdatingAttendanceUsecase.token,
  );
  const userId = readUserId(request);
  const user = await creatingOrUpdatingAttendanceUsecase.execute({ ...body, deviceId, userId });
  const userCookie = createUserCookie(user.id);
  const cookies = cookie ? [userCookie, cookie] : [userCookie];

  return { status: 201, body: UserResponse.fromDomain(user), cookies };
});
