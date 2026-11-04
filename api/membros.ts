import { NotFoundError } from "../src/bff/errors/app-error";
import { Envolviment } from "../src/bff/envolviment/Envolviment";
import { handle } from "../src/bff/http/handle";
import { readUserId } from "../src/bff/http/user-cookie";
import { FindingUserBookingUsecase } from "../src/bff/usecases/booking/FindingUserBookingUsecase";
import { UserBookingResponse } from "./_responses/UserBookingResponse";

// spec-9 C1
export const GET = handle(async (request) => {
  const userId = readUserId(request);

  if (!userId) {
    throw new NotFoundError("User Not Found");
  }

  const findingUserBookingUsecase = Envolviment.make<FindingUserBookingUsecase>(FindingUserBookingUsecase.token);
  const userBooking = await findingUserBookingUsecase.execute({ userId });

  return { body: UserBookingResponse.fromDomain(userBooking.user) };
});
