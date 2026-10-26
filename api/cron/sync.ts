import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { SupabaseClient } from "../../src/serve-utils/clients/supabase-client";
import { InvalidParameterError } from "../../src/serve-utils/errors/app-error";
import { requireCron } from "../../src/serve-utils/http/cron-auth";
import { handle } from "../../src/serve-utils/http/handle";
import type { IHormoniosRepo } from "../../src/serve-utils/interfaces/hormonios";
import type { ITransicionaisRepo } from "../../src/serve-utils/interfaces/transicionais";
import { HormoniosRepo } from "../../src/serve-utils/repos/supabase/repo";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { TransicionaisSession } from "../../src/serve-utils/repos/transicionais/session";
import { SyncingBookingPendingUsecase } from "../../src/serve-utils/usecases/sync/syncing-booking-pending";
import { SyncingNextEventPendingUsecase } from "../../src/serve-utils/usecases/sync/syncing-next-event-pending";
import { SyncingStockPendingUsecase } from "../../src/serve-utils/usecases/sync/syncing-stock-pending";

interface ISyncUsecase {
  execute(): Promise<unknown>;
}

// ?type=: o contexto a sincronizar, um usecase cada
const USECASES: Record<string, (hormoniosRepo: IHormoniosRepo, transicionaisRepo: ITransicionaisRepo) => ISyncUsecase> = {
  nextEvent: (hormoniosRepo, transicionaisRepo) => new SyncingNextEventPendingUsecase(hormoniosRepo, transicionaisRepo),
  stock: (hormoniosRepo, transicionaisRepo) => new SyncingStockPendingUsecase(hormoniosRepo, transicionaisRepo),
  booking: (hormoniosRepo, transicionaisRepo) => new SyncingBookingPendingUsecase(hormoniosRepo, transicionaisRepo),
};

export const GET = handle(async (request) => {
  await requireCron(request);

  const type = new URL(request.url).searchParams.get("type") ?? "";
  const createUsecase = USECASES[type];

  if (!createUsecase) {
    throw new InvalidParameterError(`Field type must be one of ${Object.keys(USECASES).join(", ")}`);
  }

  const httpClient = new HttpClient();
  const usecase = createUsecase(
    new HormoniosRepo(new SupabaseClient()),
    new TransicionaisRepo(httpClient, new TransicionaisSession(httpClient)),
  );

  return { body: await usecase.execute() };
});
