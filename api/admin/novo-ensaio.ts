import { Envolviment } from "../../src/serve-utils/envolviment/Envolviment";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { CreatingInternalEventUsecase } from "../../src/serve-utils/usecases/event/CreatingInternalEventUsecase";
import { EventRequest, type IEventRequest } from "./_requests/EventRequest";
import { EventResponse } from "../_responses/EventResponse";

export const POST = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IEventRequest>(request);
  const event = EventRequest.toDomain(body);
  const creatingInternalEventUsecase = Envolviment.make<CreatingInternalEventUsecase>(CreatingInternalEventUsecase.token);
  const created = await creatingInternalEventUsecase.execute(event);

  return { status: 201, body: EventResponse.fromDomain(created) };
});
