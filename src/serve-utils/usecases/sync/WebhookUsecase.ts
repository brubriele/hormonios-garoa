import { z } from "zod";
import { SyncStatus } from "../../domain/SyncStatus";
import { Webhook, WebhookEntity, WebhookResult } from "../../domain/Webhook";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger } from "../../lib/logger";
import { DateTimeSchema, NonBlankSchema, UuidSchema, validateSchema } from "../../lib/schema";
import { EventWebhookUsecase } from "./EventWebhookUsecase";

const logger = createLogger("WebhookUsecase");

const WebhookInputSchema = z.object({
  entity: NonBlankSchema,
  requestId: z.number().int().optional(),
  sendAt: DateTimeSchema,
  body: z.object({
    eventId: z.union([z.number().int().positive(), UuidSchema]),
  }),
});

type IWebhookData = z.infer<typeof WebhookInputSchema>;

export type IWebhookInput = z.input<typeof WebhookInputSchema>;

export class WebhookUsecase {
  constructor(
    private readonly transicionaisRepo: ITransicionaisRepo,
    private readonly hormoniosRepository: IHormoniosRepository,
  ) {}

  async execute(input: IWebhookInput): Promise<WebhookResult> {
    try {
      return await this._execute(input);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IWebhookInput): Promise<WebhookResult> {
    const data = this.validateInput(input);

    if (data.entity === WebhookEntity.Event) {
      const webhook = new Webhook(data.body.eventId, WebhookEntity.Event);
      const usecase = new EventWebhookUsecase(this.transicionaisRepo, this.hormoniosRepository);

      return usecase.execute(webhook);
    }

    return new WebhookResult(SyncStatus.Rejected, false);
  }

  private validateInput(input: IWebhookInput): IWebhookData {
    return validateSchema(WebhookInputSchema, input);
  }
}
