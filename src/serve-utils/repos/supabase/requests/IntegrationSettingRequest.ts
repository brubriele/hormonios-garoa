import type { IntegrationSetting } from "../../../domain/IntegrationSetting";

export interface RowSetting {
  id: string;
  data: ReturnType<IntegrationSetting["toJson"]>;
  updated_at: string;
}

export class IntegrationSettingRequest {
  static fromDomain(setting: IntegrationSetting, id: string, now: string): RowSetting {
    return {
      id,
      data: setting.toJson(),
      updated_at: now,
    };
  }
}
