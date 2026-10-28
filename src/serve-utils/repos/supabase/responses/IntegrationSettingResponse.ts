import { z } from "zod";
import type { IntegrationSetting } from "../../../domain/IntegrationSetting";
import { IntegrationSettingMapper } from "../../../domain/mappers/IntegrationSettingMapper";
import { InfraSource, InvalidResponseError } from "../../../errors/infra-error";
import { parseResponse } from "../../parse-response";

const OPERATION = "findIntegrationSetting";

// jsonb de setting.data na linha integration (IntegrationSetting.toJson)
const IntegrationSettingDataSchema = z.object({
  transicionaisEnabled: z.boolean(),
  updatedAt: z.string(),
});

const IntegrationSettingRowSchema = z.object({
  data: IntegrationSettingDataSchema,
});

export class IntegrationSettingResponse {
  static toDomain(raw: unknown): IntegrationSetting {
    const { data } = parseResponse(IntegrationSettingRowSchema, raw, InfraSource.Supabase, OPERATION);

    return InvalidResponseError.guard(InfraSource.Supabase, OPERATION, () => IntegrationSettingMapper.fromData(data));
  }

  // K1
  static toDefault(now: string): IntegrationSetting {
    return IntegrationSettingMapper.fromData({ transicionaisEnabled: true, updatedAt: now });
  }
}
