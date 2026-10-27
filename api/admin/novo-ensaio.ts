import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepository } from "../../src/serve-utils/repos/supabase/HormoniosRepository";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { CreatingInternalEventUsecase } from "../../src/serve-utils/usecases/event/CreatingInternalEventUsecase";
import { EventRequest, type IEventRequest } from "./_requests/EventRequest";
import { EventResponse } from "../_responses/EventResponse";

export const POST = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IEventRequest>(request);
  const event = EventRequest.toDomain(body);
  const httpClient = new HttpClient();
  const transicionaisRepo = new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient));
  const usecase = new CreatingInternalEventUsecase(new HormoniosRepository(new SupabaseClient()), transicionaisRepo);
  const created = await usecase.execute(event);

  return { status: 201, body: EventResponse.fromDomain(created) };
});
