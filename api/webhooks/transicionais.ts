import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { requireWebhookKey } from "../../src/serve-utils/http/webhook-auth";
import { HormoniosRepository } from "../../src/serve-utils/repos/supabase/HormoniosRepository";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { type IWebhookInput, WebhookUsecase } from "../../src/serve-utils/usecases/sync/WebhookUsecase";

export const POST = handle(async (request) => {
  await requireWebhookKey(request);

  const body = await readJson<IWebhookInput>(request);
  const httpClient = new HttpClient();
  const transicionaisRepo = new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient));
  const usecase = new WebhookUsecase(transicionaisRepo, new HormoniosRepository(new SupabaseClient()));
  const result = await usecase.execute(body);

  return { body: result.toJson() };
});
