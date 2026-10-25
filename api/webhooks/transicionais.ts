import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { verifyWebhookJwt } from "../../src/serve-utils/http/webhook-auth";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { ReceiveTransicionaisWebhookUsecase } from "../../src/serve-utils/usecases/receive-transicionais-webhook";

// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export const POST = handle(async (request) => {
  await verifyWebhookJwt(request);

  const body = await readJson<Record<string, unknown>>(request);
  const httpClient = new HttpClient();
  const usecase = new ReceiveTransicionaisWebhookUsecase(
    new HormoniosRepo(new SupabaseClient()),
    new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient)),
  );
  await usecase.execute({ body }); // entrega repetida também responde 204, sem processar

  return {};
});
