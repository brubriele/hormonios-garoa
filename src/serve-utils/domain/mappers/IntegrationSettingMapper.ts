import { IntegrationSetting } from "../IntegrationSetting";

export interface IIntegrationSettingData {
  transicionaisEnabled: boolean;
  updatedAt: string;
}

// M11
export class IntegrationSettingMapper {
  static fromData(data: IIntegrationSettingData): IntegrationSetting {
    return new IntegrationSetting(data.transicionaisEnabled, data.updatedAt);
  }
}
