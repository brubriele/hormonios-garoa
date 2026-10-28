import { Envolviment } from "../src/bff/envolviment/Envolviment";
import { handle } from "../src/bff/http/handle";
import { readUserId } from "../src/bff/http/user-cookie";
import { FindingUserBookingUsecase } from "../src/bff/usecases/booking/FindingUserBookingUsecase";
import { UserBookingResponse } from "./_responses/UserBookingResponse";

export const GET = handle(async (request) => {
  const userId = readUserId(request);
  const findingUserBookingUsecase = Envolviment.make<FindingUserBookingUsecase>(FindingUserBookingUsecase.token);
  const user = await findingUserBookingUsecase.execute({ userId });

  return { body: UserBookingResponse.fromDomain(user) };
});
