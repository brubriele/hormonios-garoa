import { Envolviment } from "../../src/serve-utils/envolviment/Envolviment";
import { requireAdmin } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";
import { FindingIntegrationSettingUsecase } from "../../src/serve-utils/usecases/event/FindingIntegrationSettingUsecase";
import { UpdatingIntegrationSettingUsecase } from "../../src/serve-utils/usecases/event/UpdatingIntegrationSettingUsecase";
import { type IIntegrationSettingRequest, IntegrationSettingRequest } from "./_requests/IntegrationSettingRequest";
import { IntegrationSettingResponse } from "../_responses/IntegrationSettingResponse";

// K2
export const GET = handle(async (request) => {
  await requireAdmin(request);

  const findingIntegrationSettingUsecase = await Envolviment.make<FindingIntegrationSettingUsecase>(
    FindingIntegrationSettingUsecase.token,
  );
  const setting = await findingIntegrationSettingUsecase.execute();

  return { body: IntegrationSettingResponse.fromDomain(setting) };
});

// K2
export const PUT = handle(async (request) => {
  await requireAdmin(request);

  const body = await readJson<IIntegrationSettingRequest>(request);
  const setting = IntegrationSettingRequest.toDomain(body);
  const updatingIntegrationSettingUsecase = await Envolviment.make<UpdatingIntegrationSettingUsecase>(
    UpdatingIntegrationSettingUsecase.token,
  );
  const updated = await updatingIntegrationSettingUsecase.execute(setting);

  return { body: IntegrationSettingResponse.fromDomain(updated) };
});
