import { z } from "zod";
import { AppError } from "../../errors/app-error";
import { createLogger } from "../../lib/logger";
import { BookingAnswer } from "../../models/booking";
import type { CurrentEvent } from "../../models/current-event";
import type { EventSnapshot } from "../../models/event-snapshot";
import { validateSchema } from "../../models/model-schema";
import { EventWebhookStatus, WebhookType } from "../../models/transicionais-webhook";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type {
  IEventRef,
  IEventWebhookResult,
  ITransicionaisRepo,
  ITransicionaisWebhook,
  IWebhookValidation,
} from "../../interfaces/transicionais";
import { ReceivingCurrentEventUsecase } from "./receiving-current-event";

const logger = createLogger("ReceivingTransicionaisWebhookUsecase");

export interface IReceivingTransicionaisWebhookInput {
  body: unknown; // corpo cru do webhook: só o repo do Transicionais o lê
}

// o formato do corpo é do schema do repo do Transicionais (parseWebhook); aqui, só que ele veio
const ReceiveTransicionaisWebhookInputSchema = z.object({
  body: z.record(z.string(), z.unknown()),
});

export interface IReceivingTransicionaisWebhookResult {
  processed: boolean; // false = entrega repetida (deduplicação)
}

// POST /api/webhooks/transicionais ("Webhooks" de bff-fase-2.md): deduplica pelo deliveryId e aplica
// event.updated (trava do retrato) e validation.changed (travas de changedAt e da mudança local)
// em rascunho: webhook do Transicionais, ainda não revisado pela Bea. Não usar até a revisão.
/** @deprecated Em rascunho, aguardando revisão (webhook do Transicionais). */
export class ReceivingTransicionaisWebhookUsecase {
  private readonly receivingCurrentEvent: ReceivingCurrentEventUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.receivingCurrentEvent = new ReceivingCurrentEventUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: IReceivingTransicionaisWebhookInput): Promise<IReceivingTransicionaisWebhookResult> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      logger.error({ err: error }, "unexpected error");
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: IReceivingTransicionaisWebhookInput): Promise<IReceivingTransicionaisWebhookResult> {
    this.validateInput(input);

    const current = await this.findSupabaseCurrentEvent();
    const webhook = this.transicionaisRepo.parseWebhook(input.body, this.buildEventRef(current));
    const isNew = await this.registerSupabaseDelivery(webhook);

    if (!isNew) {
      return { processed: false };
    }

    try {
      await this.applyWebhook(webhook, current);
    } catch (error) {
      // a entrega não foi aplicada: o reenvio do Transicionais precisa passar (dúvida D38)
      await this.releaseSupabaseDelivery(webhook.deliveryId);
      throw error;
    }

    return { processed: true };
  }

  private validateInput(input: IReceivingTransicionaisWebhookInput) {
    validateSchema(ReceiveTransicionaisWebhookInputSchema, input);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent | null> {
    return this.hormoniosRepo.findCurrentEvent();
  }

  // retrato local da fase 1: nenhum webhook de encontro vale (a rotina migra na primeira leitura)
  private buildEventRef(current: CurrentEvent | null): IEventRef | null {
    if (!current || current.externalId === null) {
      return null;
    }

    return { externalId: current.externalId, dayId: current.dayKey };
  }

  private async registerSupabaseDelivery(webhook: ITransicionaisWebhook): Promise<boolean> {
    return this.hormoniosRepo.registerWebhookDelivery({ deliveryId: webhook.deliveryId, type: webhook.type });
  }

  private async releaseSupabaseDelivery(deliveryId: string): Promise<void> {
    try {
      await this.hormoniosRepo.releaseWebhookDelivery(deliveryId);
    } catch (error) {
      logger.error({ err: error, deliveryId }, "could not release webhook delivery (D38)");
    }
  }

  private async applyWebhook(webhook: ITransicionaisWebhook, current: CurrentEvent | null): Promise<void> {
    if (webhook.type === WebhookType.EventUpdated) {
      return this.applyEventUpdated(webhook.result);
    }

    if (webhook.type === WebhookType.ValidationChanged) {
      return this.applyValidationChanged(webhook.validation, current);
    }

    logger.warn({ type: webhook.rawType }, "ignored webhook type");
  }

  // mesma trava do retrato (gravar_retrato); externalId de outro encontro é ignorado. O retrato que
  // não deu para mapear (o dia mudou) é relido pela rotina (dúvida D35)
  private async applyEventUpdated(result: IEventWebhookResult): Promise<void> {
    if (result.status === EventWebhookStatus.OtherEvent) {
      return;
    }

    if (result.status === EventWebhookStatus.Snapshot) {
      await this.saveSupabaseSnapshot(result.snapshot);
      return;
    }

    await this.receivingCurrentEvent.execute();
  }

  private async saveSupabaseSnapshot(snapshot: EventSnapshot): Promise<void> {
    await this.hormoniosRepo.saveSnapshot(snapshot);
  }

  // regras 1 a 6 da seção Webhooks: a reserva (pelas travas da função aplicar_validacao) e as vagas.
  // Pessoa fora de hg_users (B6): só as vagas
  private async applyValidationChanged(validation: IWebhookValidation, current: CurrentEvent | null): Promise<void> {
    const groupId = validation.answer === BookingAnswer.Going ? validation.groupId : null;

    await this.hormoniosRepo.applyValidation({
      orderId: validation.orderId,
      dayKey: validation.dayKey,
      guestId: validation.guestId,
      email: validation.email,
      answer: validation.answer,
      groupId,
      supportIds: groupId === null ? [] : this.buildAccessoryIds(validation.supportTypeIds, current),
      changedAt: validation.changedAt,
    });

    await this.saveSupabaseVacancies(validation, current);
  }

  // o Transicionais manda o instrumento junto dos acessórios; no Hormônios, supportIds são só os acessórios
  private buildAccessoryIds(supportTypeIds: string[], current: CurrentEvent | null): string[] {
    const instrumentIds = new Set(
      (current?.groups ?? []).map((group) => group.instrumentSupportId).filter((id) => id !== null),
    );

    return [...new Set(supportTypeIds.filter((id) => !instrumentIds.has(id)))];
  }

  // ocupado por assistência -> taken do instrumento (pelo instrumentSupportId do grupo) e do acessório.
  // A trava (vacanciesAt mais novo, mesmo dia) fica na função gravar_vagas
  private async saveSupabaseVacancies(validation: IWebhookValidation, current: CurrentEvent | null): Promise<void> {
    const occupied = validation.occupied;

    if (!occupied || !current?.isFromTransicionais || current.dayKey !== validation.dayKey) {
      return;
    }

    const groups: Record<string, number> = {};
    const supports: Record<string, number> = {};

    for (const group of current.groups) {
      if (group.instrumentSupportId !== null && occupied[group.instrumentSupportId] !== undefined) {
        groups[group.id] = occupied[group.instrumentSupportId];
      }
    }

    for (const support of current.supports) {
      if (occupied[support.id] !== undefined) {
        supports[support.id] = occupied[support.id];
      }
    }

    if (Object.keys(groups).length === 0 && Object.keys(supports).length === 0) {
      return;
    }

    await this.hormoniosRepo.saveVacancies({
      dayKey: validation.dayKey,
      vacanciesAt: validation.changedAt,
      groups,
      supports,
    });
  }
}
