import { z } from "zod";
import { IntegrationSetting } from "../../domain/IntegrationSetting";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";
import { validateSchema } from "../../lib/schema";

const logger = createLogger("UpdatingIntegrationSettingUsecase", LogContext.Event);

const UpdatingIntegrationSettingInputSchema = z.instanceof(IntegrationSetting);

export class UpdatingIntegrationSettingUsecase {
  static readonly token = "UpdatingIntegrationSettingUsecase";

  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(input: IntegrationSetting): Promise<IntegrationSetting> {
    try {
      const setting = await this._execute(input);

      return setting;
    } catch (error) {
      if (error instanceof AppError) {
        logger.appError(error);
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  // K2, K5
  private async _execute(input: IntegrationSetting): Promise<IntegrationSetting> {
    logger.track("updating integration setting");

    const setting = this.validateInput(input);
    const updated = await this.updateIntegrationSetting(setting);

    return updated;
  }

  private validateInput(input: IntegrationSetting): IntegrationSetting {
    return validateSchema(UpdatingIntegrationSettingInputSchema, input);
  }

  private async updateIntegrationSetting(setting: IntegrationSetting): Promise<IntegrationSetting> {
    return this.hormoniosRepository.updateIntegrationSetting(setting);
  }
}
