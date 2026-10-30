import { Envolviment } from "../../../src/bff/envolviment/Envolviment";
import { requireAdmin } from "../../../src/bff/http/admin-session";
import { handle } from "../../../src/bff/http/handle";
import { ActiveNextEventUsecase } from "../../../src/bff/usecases/event/ActiveNextEventUsecase";
import { EventResponse } from "../../_responses/EventResponse";

// spec-8 B3
export const POST = handle(async (request) => {
  await requireAdmin(request);

  const activeNextEventUsecase = Envolviment.make<ActiveNextEventUsecase>(ActiveNextEventUsecase.token);
  const current = await activeNextEventUsecase.execute();

  return { body: EventResponse.fromDomain(current) };
});
