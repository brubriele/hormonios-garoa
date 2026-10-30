import { Envolviment } from "../../src/bff/envolviment/Envolviment";
import { requireAdmin } from "../../src/bff/http/admin-session";
import { handle, readJson } from "../../src/bff/http/handle";
import { BookingAvailabilityUsecase } from "../../src/bff/usecases/event/BookingAvailabilityUsecase";
import { BookingAvailabilityRequest, type IBookingAvailabilityRequest } from "./_requests/BookingAvailabilityRequest";
import { EventResponse } from "../_responses/EventResponse";

// spec-8 B7
export const PUT = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IBookingAvailabilityRequest>(request);
  const event = BookingAvailabilityRequest.toDomain(body);
  const bookingAvailabilityUsecase = Envolviment.make<BookingAvailabilityUsecase>(BookingAvailabilityUsecase.token);
  const updated = await bookingAvailabilityUsecase.execute(event);

  return { body: EventResponse.fromDomain(updated) };
});
