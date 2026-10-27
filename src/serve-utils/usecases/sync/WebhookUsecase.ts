import { z } from "zod";
import { SyncStatus } from "../../domain/SyncStatus";
import { Webhook, WebhookEntity, WebhookResult } from "../../domain/Webhook";
import { AppError } from "../../errors/app-error";
import type { IHormoniosRepository } from "../../interfaces/IHormoniosRepository";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import { createLogger } from "../../lib/logger";
import { DateTimeSchema, NonBlankSchema, UuidSchema, validateSchema } from "../../lib/schema";
import { AttendanceWebhookUsecase } from "./AttendanceWebhookUsecase";
import { EventWebhookUsecase } from "./EventWebhookUsecase";
import { UserWebhookUsecase } from "./UserWebhookUsecase";

const logger = createLogger("WebhookUsecase");

const WebhookInputSchema = z
  .object({
    entity: NonBlankSchema,
    requestId: z.number().int().optional(),
    sendAt: DateTimeSchema,
    body: z.object({
      eventId: z.union([z.number().int().positive(), UuidSchema]).optional(),
      userId: UuidSchema.optional(),
      validationId: z.number().int().positive().optional(),
    }),
  })
  .refine((input) => input.entity !== WebhookEntity.Event || input.body.eventId !== undefined, {
    path: ["body", "eventId"],
    message: "is required",
  })
  .refine((input) => input.entity !== WebhookEntity.User || input.body.userId !== undefined, {
    path: ["body", "userId"],
    message: "is required",
  })
  .refine((input) => input.entity !== WebhookEntity.Validation || input.body.validationId !== undefined, {
    path: ["body", "validationId"],
    message: "is required",
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

    const { eventId, userId, validationId } = data.body;

    if (data.entity === WebhookEntity.Event && eventId !== undefined) {
      logger.info('Processing EventWebhookUseCase')
      const webhook = new Webhook(eventId, WebhookEntity.Event);
      const usecase = new EventWebhookUsecase(this.transicionaisRepo, this.hormoniosRepository);

      return usecase.execute(webhook);
    }

    if (data.entity === WebhookEntity.User && userId !== undefined) {
      const webhook = new Webhook(userId, WebhookEntity.User);
      const usecase = new UserWebhookUsecase(this.transicionaisRepo, this.hormoniosRepository);

      return usecase.execute(webhook);
    }

    if (data.entity === WebhookEntity.Validation && validationId !== undefined) {
      const webhook = new Webhook(validationId, WebhookEntity.Validation);
      const usecase = new AttendanceWebhookUsecase(this.transicionaisRepo, this.hormoniosRepository);

      return usecase.execute(webhook);
    }

    return new WebhookResult(SyncStatus.Rejected, false);
  }

  private validateInput(input: IWebhookInput): IWebhookData {
    return validateSchema(WebhookInputSchema, input);
  }
}
