import { z } from "zod";
import { AppError, UpstreamUnavailableError } from "../../errors/app-error";
import { AnswerChangedError, UpstreamBadContractError, UpstreamResponseError } from "../../errors/infra-error";
import { createLogger } from "../../lib/logger";
import { Booking, BookingAnswer, BookingSync, SyncMode } from "../../models/booking";
import { CurrentEvent } from "../../models/current-event";
import { validateSchema } from "../../models/model-schema";
import type { IHormoniosRepo, IMarkSyncData, IMarkSyncLock } from "../../interfaces/hormonios";
import type { ITransicionaisPresence, ITransicionaisRepo } from "../../interfaces/transicionais";

const logger = createLogger("SyncingUserBookingUsecase");

export interface ISyncingUserBookingInput {
  booking: Booking; // o estado atual da linha, lido do banco (com o updated_at)
  event: CurrentEvent;
  ip: string | null; // IP real (H11); no cron, null
}

const SyncingUserBookingInputSchema = z.object({
  booking: z.instanceof(Booking),
  event: z.instanceof(CurrentEvent),
  ip: z.string().nullable(),
});

export interface ISyncingUserBookingOutcome {
  sync: BookingSync; // como a linha ficou: SYNCED, PENDING ou MANUAL_RETRY (D44, D50: nunca REJECTED)
}

// envio de uma reserva ao Transicionais e a gravação do resultado com a trava do updated_at
// (E2.8, "Escrita da reserva" e "Cron de sincronização"). Usado por CreatingUserBookingUsecase,
// CancelingUserBookingUsecase e SyncingBookingPendingUsecase (como o ReceivingCurrentEventUsecase, D10).
// Uma falha do envio nunca derruba a reserva local: qualquer erro, inclusive a recusa do Transicionais,
// deixa a linha PENDING até sincronizar de fato (D32, D44)
export class SyncingUserBookingUsecase {
  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(input: ISyncingUserBookingInput): Promise<ISyncingUserBookingOutcome> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      logger.error({ err: error }, "unexpected error");
      return { sync: BookingSync.Pending }; // o cron tenta de novo
    }
  }

  private async _execute(input: ISyncingUserBookingInput): Promise<ISyncingUserBookingOutcome> {
    this.validateInput(input);

    if (!this.canSend(input)) {
      return { sync: input.booking.sync };
    }

    const result = await this.sendTransicionaisBooking(input);

    return this.markSupabaseSync(result);
  }

  private validateInput(input: ISyncingUserBookingInput) {
    validateSchema(SyncingUserBookingInputSchema, input);
  }

  // retrato local da fase 1 (externalId null), linha de ensaio antigo da fase 1 ou que já saiu de
  // PENDING: não envia. Linha de outro dia do Transicionais envia (D45)
  private canSend(input: ISyncingUserBookingInput): boolean {
    const { booking, event } = input;

    return (
      event.isFromTransicionais
      && booking.isFromTransicionaisDay
      && booking.isPending
      && booking.updatedAt !== null
    );
  }

  // a presença de lá primeiro (D49): se já é a da linha local (um envio anterior que deu timeout mas
  // foi gravado, por exemplo), marca SYNCED sem reenviar. Senão, dois passos (D41): a conta da pessoa
  // na organização (cadastro idempotente pelo e-mail) e a resposta em nome dela; depois relê a
  // presença para gravar o hash e o orderId. O repo devolve o aceito ou lança; a escolha do SyncMode é
  // daqui (tabela "Tradução das keys do Transicionais" de bff-fase-2-implementacao.md)
  private async sendTransicionaisBooking(input: ISyncingUserBookingInput): Promise<IMarkSyncData> {
    const { booking, event, ip } = input;
    const lock: IMarkSyncLock = { bookingId: booking.id, updatedAt: booking.updatedAt ?? "" };
    const supportTypeIds = this.buildSupportTypeIds(booking, event);

    try {
      const current = await this.findTransicionaisPresence(booking);

      if (current && this.isSamePresence(current, booking, supportTypeIds)) {
        return this.buildSynced(lock, null, current);
      }

      const account = await this.transicionaisRepo.registerGuest({
        email: booking.user.email,
        name: booking.user.name,
        pronoun: booking.user.pronoun,
      });

      await this.transicionaisRepo.sendBooking({
        bookingId: booking.id,
        account,
        dayKey: booking.dayKey,
        answer: booking.answer,
        groupId: booking.answer === BookingAnswer.Going ? booking.groupId : null,
        supportTypeIds,
        ip,
      });

      return this.buildSynced(lock, account.guestId, await this.findSentPresence(booking));
    } catch (error) {
      return this.buildFailedSend(error, lock);
    }
  }

  private async findTransicionaisPresence(booking: Booking): Promise<ITransicionaisPresence | null> {
    return this.transicionaisRepo.findPresence(booking.dayKey, booking.user.email);
  }

  // depois do envio aceito, a releitura é só para o hash: se falhar, o envio continua valendo
  private async findSentPresence(booking: Booking): Promise<ITransicionaisPresence | null> {
    try {
      return await this.findTransicionaisPresence(booking);
    } catch (error) {
      logger.warn({ err: error, bookingId: booking.id }, "presence not read after send, hash not saved (D49)");
      return null;
    }
  }

  // a resposta, o grupo e as assistências de lá já são os da linha local
  private isSamePresence(presence: ITransicionaisPresence, booking: Booking, supportTypeIds: string[]): boolean {
    const groupId = booking.answer === BookingAnswer.Going ? booking.groupId : null;
    const local = new Set(supportTypeIds);
    const remote = new Set(presence.supportTypeIds);

    return (
      presence.answer === booking.answer
      && presence.groupId === groupId
      && local.size === remote.size
      && [...local].every((id) => remote.has(id))
    );
  }

  // o changed_at não vem do envio: fica como estava até o webhook validation.changed
  private buildSynced(
    lock: IMarkSyncLock,
    guestId: string | null,
    presence: ITransicionaisPresence | null,
  ): IMarkSyncData {
    return {
      mode: SyncMode.Synced,
      ...lock,
      guestId,
      orderId: presence?.orderId ?? null,
      changedAt: null,
      hash: presence?.hash ?? null,
    };
  }

  // a resposta mudou no Transicionais: próximo ciclo. Fora do ar, recusa do Transicionais (AppError),
  // 401/403 depois de renovar ou qualquer outra falha: PENDING, e volta na próxima chamada do cron
  // (D46). A reserva local nunca é desfeita pelo Transicionais (D32, D44). 400, 409 ou 422:
  // MANUAL_RETRY, fora do cron até o ajuste manual. O erro do Transicionais é gravado como veio (D50)
  private buildFailedSend(error: unknown, lock: IMarkSyncLock): IMarkSyncData {
    if (error instanceof AnswerChangedError) {
      return { mode: SyncMode.Retry, ...lock, errorCause: null };
    }

    if (error instanceof UpstreamBadContractError) {
      logger.error({ bookingId: lock.bookingId, errorCause: error.errorCause }, "booking needs a manual retry (D50)");
      return { mode: SyncMode.ManualRetry, ...lock, errorCause: error.errorCause };
    }

    if (error instanceof UpstreamUnavailableError) {
      return { mode: SyncMode.Backoff, ...lock, errorCause: null };
    }

    if (error instanceof AppError) {
      logger.error({ bookingId: lock.bookingId, key: error.key }, "booking refused by Transicionais, stays PENDING (D44)");
      return { mode: SyncMode.Backoff, ...lock, errorCause: null };
    }

    logger.error({ err: error, bookingId: lock.bookingId }, "booking not sent (D32)");
    const errorCause = error instanceof UpstreamResponseError ? error.errorCause : null;

    return { mode: SyncMode.Backoff, ...lock, errorCause };
  }

  // a assistência do instrumento do grupo + os acessórios (E2.9). Só presença ou "não vou": nenhuma
  private buildSupportTypeIds(booking: Booking, event: CurrentEvent): string[] {
    if (booking.answer !== BookingAnswer.Going || booking.groupId === null) {
      return [];
    }

    const instrumentSupportId = event.findGroup(booking.groupId)?.instrumentSupportId ?? null;
    const supportIds = this.filterOfferedSupportIds(booking, event, booking.groupId);

    return instrumentSupportId === null ? supportIds : [instrumentSupportId, ...supportIds];
  }

  // só os acessórios que o encontro oferece para o grupo: a linha migrada da fase 1 (migrar_fase1)
  // ainda tem os ids locais (talabarte, baqueta), que não existem no Transicionais (D42)
  private filterOfferedSupportIds(booking: Booking, event: CurrentEvent, groupId: string): string[] {
    const offered = new Set(event.supportsForGroup(groupId).map((support) => support.id));
    const ignored = booking.supportIds.filter((id) => !offered.has(id));

    if (ignored.length > 0) {
      logger.warn({ bookingId: booking.id, ignored }, "support not offered by the event, not sent (D42)");
    }

    return booking.supportIds.filter((id) => offered.has(id));
  }

  // grava só se a linha ainda é a enviada; se mudou durante o envio, continua PENDING
  private async markSupabaseSync(sync: IMarkSyncData): Promise<ISyncingUserBookingOutcome> {
    const applied = await this.hormoniosRepo.markSync(sync);

    if (!applied) {
      return { sync: BookingSync.Pending };
    }

    if (sync.mode === SyncMode.Synced) {
      return { sync: BookingSync.Synced };
    }

    return { sync: sync.mode === SyncMode.ManualRetry ? BookingSync.ManualRetry : BookingSync.Pending };
  }
}
