import { Envolviment } from "../src/serve-utils/envolviment/Envolviment";
import { handle } from "../src/serve-utils/http/handle";
import { readUserId } from "../src/serve-utils/http/user-cookie";
import { FindingUserBookingUsecase } from "../src/serve-utils/usecases/booking/FindingUserBookingUsecase";
import { UserBookingResponse } from "./_responses/UserBookingResponse";

export const GET = handle(async (request) => {
  const userId = readUserId(request);
  const findingUserBookingUsecase = await Envolviment.make<FindingUserBookingUsecase>(FindingUserBookingUsecase.token);
  const user = await findingUserBookingUsecase.execute({ userId });

  return { body: UserBookingResponse.fromDomain(user) };
});
