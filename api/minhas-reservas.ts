import { SupabaseClient } from "../src/serve-utils/clients/supabase-client";
import { handle } from "../src/serve-utils/http/handle";
import { readUserId } from "../src/serve-utils/http/user-cookie";
import { HormoniosRepository } from "../src/serve-utils/repos/supabase/HormoniosRepository";
import { FindingUserBookingUsecase } from "../src/serve-utils/usecases/booking/FindingUserBookingUsecase";

export const GET = handle(async (request) => {
  const userId = readUserId(request);
  const usecase = new FindingUserBookingUsecase(new HormoniosRepository(new SupabaseClient()));
  const user = await usecase.execute({ userId });
  const attendances = user.attendances.map((attendance) => attendance.toJson());

  return { body: { ...user.toJson(), attendances } };
});
