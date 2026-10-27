import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepository } from "../../src/serve-utils/repos/supabase/HormoniosRepository";
import { CreatingInternalEventUsecase } from "../../src/serve-utils/usecases/event/CreatingInternalEventUsecase";
import { EventRequest, type IEventRequest } from "./_requests/EventRequest";

export const POST = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IEventRequest>(request);
  const event = EventRequest.toDomain(body);
  const usecase = new CreatingInternalEventUsecase(new HormoniosRepository(new SupabaseClient()));
  const created = await usecase.execute(event);

  return { status: 201, body: created.toJson() };
});
