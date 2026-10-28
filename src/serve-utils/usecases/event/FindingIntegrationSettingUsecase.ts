import type { IntegrationSetting } from "../../domain/IntegrationSetting";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import { createLogger, LogContext } from "../../lib/logger";

const logger = createLogger("FindingIntegrationSettingUsecase", LogContext.Event);

export class FindingIntegrationSettingUsecase {
  static readonly token = "FindingIntegrationSettingUsecase";

  constructor(private readonly hormoniosRepository: IHormoniosRepository) {}

  async execute(): Promise<IntegrationSetting> {
    try {
      const setting = await this._execute();

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

  // K1
  private async _execute(): Promise<IntegrationSetting> {
    logger.track("finding integration setting");

    const setting = await this.findIntegrationSetting();

    return setting;
  }

  private async findIntegrationSetting(): Promise<IntegrationSetting> {
    return this.hormoniosRepository.findIntegrationSetting();
  }
}
