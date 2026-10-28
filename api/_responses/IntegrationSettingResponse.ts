import type { IntegrationSetting } from "../../src/serve-utils/domain/IntegrationSetting";

export class IntegrationSettingResponse {
  static fromDomain(setting: IntegrationSetting) {
    return {
      transicionaisEnabled: setting.transicionaisEnabled,
      updatedAt: setting.updatedAt,
    };
  }
}
