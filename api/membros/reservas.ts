import { Envolviment } from "../../src/bff/envolviment/Envolviment";
import { getOrCreateDevice } from "../../src/bff/http/device";
import { handle, readJson, type IHttpResult } from "../../src/bff/http/handle";
import { createUserCookie, readUserId } from "../../src/bff/http/user-cookie";
import {
  CreatingOrUpdatingAttendanceUsecase,
  type ICreatingOrUpdatingAttendanceBody,
} from "../../src/bff/usecases/booking/CreatingOrUpdatingAttendanceUsecase";
import { UserResponse } from "../_responses/UserResponse";

// spec-8 G3
async function saveAttendance(request: Request, status: number): Promise<IHttpResult> {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await readJson<ICreatingOrUpdatingAttendanceBody>(request);
  const creatingOrUpdatingAttendanceUsecase = Envolviment.make<CreatingOrUpdatingAttendanceUsecase>(
    CreatingOrUpdatingAttendanceUsecase.token,
  );
  const userId = readUserId(request);
  const user = await creatingOrUpdatingAttendanceUsecase.execute({ ...body, deviceId, userId });
  const userCookie = createUserCookie(user.id);
  const cookies = cookie ? [userCookie, cookie] : [userCookie];

  return { status, body: UserResponse.fromDomain(user), cookies };
}

// F7
export const POST = handle((request) => saveAttendance(request, 201));

// D15, F7, F8
export const PATCH = handle((request) => saveAttendance(request, 200));
