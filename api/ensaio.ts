import { Envolviment } from "../src/bff/envolviment/Envolviment";
import { handle } from "../src/bff/http/handle";
import { FindingPublicEventUsecase } from "../src/bff/usecases/event/FindingPublicEventUsecase";
import { EventResponse } from "./_responses/EventResponse";

export const GET = handle(async () => {
  const findingPublicEventUsecase = Envolviment.make<FindingPublicEventUsecase>(FindingPublicEventUsecase.token);
  const event = await findingPublicEventUsecase.execute();

  return { body: EventResponse.fromDomain(event) };
});
