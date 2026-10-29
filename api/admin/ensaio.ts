import { Envolviment } from "../../src/bff/envolviment/Envolviment";
import { requireAdmin } from "../../src/bff/http/admin-session";
import { handle, readJson } from "../../src/bff/http/handle";
import { FindingInternalEventUsecase } from "../../src/bff/usecases/event/FindingInternalEventUsecase";
import { UpdatingInternalEventUsecase } from "../../src/bff/usecases/event/UpdatingInternalEventUsecase";
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
