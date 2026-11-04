import { EventPosition, FindingInternalFilter } from "../../src/bff/domain/FindingInternalFilter";
import { Envolviment } from "../../src/bff/envolviment/Envolviment";
import { requireAdmin } from "../../src/bff/http/admin-session";
import { handle, readJson } from "../../src/bff/http/handle";
import { CreatingInternalEventUsecase } from "../../src/bff/usecases/event/CreatingInternalEventUsecase";
import { FindingInternalEventUsecase } from "../../src/bff/usecases/event/FindingInternalEventUsecase";
import { UpdatingInternalEventUsecase } from "../../src/bff/usecases/event/UpdatingInternalEventUsecase";
import { EventRequest, type IEventRequest } from "./_requests/EventRequest";
import { EventResponse } from "../_responses/EventResponse";
import { ManagerEventResponse } from "../_responses/ManagerEventResponse";

// spec-8 D2
const POSITIONS: Record<string, EventPosition> = {
  atual: EventPosition.Current,
  proximo: EventPosition.Next,
};

export const GET = handle(async (request) => {
  await requireAdmin(request);

  const url = new URL(request.url);
  const posicao = url.searchParams.get("posicao") ?? "atual";
  const filter = new FindingInternalFilter({ position: POSITIONS[posicao] });
  const findingInternalEventUsecase = Envolviment.make<FindingInternalEventUsecase>(FindingInternalEventUsecase.token);
  const managerEvent = await findingInternalEventUsecase.execute(filter);

  return { body: ManagerEventResponse.fromDomain(managerEvent) };
});

// spec-8 G2
export const POST = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IEventRequest>(request);
  const event = EventRequest.toDomain(body);
  const creatingInternalEventUsecase = Envolviment.make<CreatingInternalEventUsecase>(CreatingInternalEventUsecase.token);
  const created = await creatingInternalEventUsecase.execute(event);

  return { status: 201, body: EventResponse.fromDomain(created) };
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
