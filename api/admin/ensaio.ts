import { Envolviment } from "../../src/serve-utils/envolviment/Envolviment";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { FindingInternalEventUsecase } from "../../src/serve-utils/usecases/event/FindingInternalEventUsecase";
import { UpdatingInternalEventUsecase } from "../../src/serve-utils/usecases/event/UpdatingInternalEventUsecase";
import { EventRequest, type IEventRequest } from "./_requests/EventRequest";
import { ManagerEventResponse } from "../_responses/ManagerEventResponse";

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const findingInternalEventUsecase = Envolviment.make<FindingInternalEventUsecase>(FindingInternalEventUsecase.token);
  const managerEvent = await findingInternalEventUsecase.execute();

  return { body: ManagerEventResponse.fromDomain(managerEvent) };
});

// D13
export const PUT = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IEventRequest>(request);
  const event = EventRequest.toDomain(body);
  const updatingInternalEventUsecase = Envolviment.make<UpdatingInternalEventUsecase>(UpdatingInternalEventUsecase.token);
  const managerEvent = await updatingInternalEventUsecase.execute(event);

  return { body: ManagerEventResponse.fromDomain(managerEvent) };
});
