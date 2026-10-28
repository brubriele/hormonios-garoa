import { z } from "zod";
import { DateTimeSchema, validateSchema } from "../lib/schema";

const IntegrationSettingSchema = z.object({
  transicionaisEnabled: z.boolean(),
  updatedAt: DateTimeSchema,
});

// K1
export class IntegrationSetting {
  constructor(
    readonly transicionaisEnabled: boolean,
    readonly updatedAt: string,
  ) {
    this.validate();
  }

  private validate() {
    validateSchema(IntegrationSettingSchema, this, "integrationSetting");
  }

  toJson() {
    return { transicionaisEnabled: this.transicionaisEnabled, updatedAt: this.updatedAt };
  }
}
