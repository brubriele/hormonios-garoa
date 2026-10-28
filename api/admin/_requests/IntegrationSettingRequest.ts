import type { IntegrationSetting } from "../../../src/serve-utils/domain/IntegrationSetting";
import { IntegrationSettingMapper } from "../../../src/serve-utils/domain/mappers/IntegrationSettingMapper";

export interface IIntegrationSettingRequest {
  transicionaisEnabled: boolean;
}

export class IntegrationSettingRequest {
  static toDomain(body: IIntegrationSettingRequest): IntegrationSetting {
    const now = new Date();
    const updatedAt = now.toISOString();

    return IntegrationSettingMapper.fromData({ transicionaisEnabled: body.transicionaisEnabled, updatedAt });
  }
}
