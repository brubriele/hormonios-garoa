import { Envolviment } from "../../src/serve-utils/envolviment/Envolviment";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { requireWebhookKey } from "../../src/serve-utils/http/webhook-auth";
import { type IWebhookInput, WebhookUsecase } from "../../src/serve-utils/usecases/sync/WebhookUsecase";

export const POST = handle(async (request) => {
  await requireWebhookKey(request);

  const body = await readJson<IWebhookInput>(request);
  const webhookUsecase = await Envolviment.make<WebhookUsecase>(WebhookUsecase.token);
  const result = await webhookUsecase.execute(body);

  return { body: result.toJson() };
});
