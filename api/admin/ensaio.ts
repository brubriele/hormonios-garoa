import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { HormoniosRepository } from "../../src/serve-utils/repos/supabase/HormoniosRepository";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { FindingInternalEventUsecase } from "../../src/serve-utils/usecases/event/FindingInternalEventUsecase";
import { UpdatingInternalEventUsecase } from "../../src/serve-utils/usecases/event/UpdatingInternalEventUsecase";
import { EventRequest, type IEventRequest } from "./_requests/EventRequest";
import { ManagerEventResponse } from "../_responses/ManagerEventResponse";

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const httpClient = new HttpClient();
  const transicionaisRepo = new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient));
  const usecase = new FindingInternalEventUsecase(new HormoniosRepository(new SupabaseClient()), transicionaisRepo);
  const managerEvent = await usecase.execute();

  return { body: ManagerEventResponse.fromDomain(managerEvent) };
});

// D13
export const PUT = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IEventRequest>(request);
  const event = EventRequest.toDomain(body);
  const usecase = new UpdatingInternalEventUsecase(new HormoniosRepository(new SupabaseClient()));
  const managerEvent = await usecase.execute(event);

  return { body: ManagerEventResponse.fromDomain(managerEvent) };
});
