import { Envolviment } from "../src/serve-utils/envolviment/Envolviment";
import { handle } from "../src/serve-utils/http/handle";
import { FindingPublicEventUsecase } from "../src/serve-utils/usecases/event/FindingPublicEventUsecase";
import { EventResponse } from "./_responses/EventResponse";

export const GET = handle(async () => {
  const findingPublicEventUsecase = Envolviment.make<FindingPublicEventUsecase>(FindingPublicEventUsecase.token);
  const event = await findingPublicEventUsecase.execute();

  return { body: EventResponse.fromDomain(event) };
});
