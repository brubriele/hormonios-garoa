import { z } from "zod";
import { AppError, UpstreamUnavailableError } from "../errors/app-error";
import { AnswerChangedError, UpstreamBadContractError, UpstreamResponseError } from "../errors/infra-error";
import { createLogger } from "../lib/logger";
import { Attendance, AttendanceAnswer, AttendanceSync, SyncMode } from "../models/attendance";
import { CurrentEvent } from "../models/current-event";
import { validateSchema } from "../models/model-schema";
import type { IHormoniosRepo, IMarkSyncData, IMarkSyncLock } from "../interfaces/hormonios";
import type { ITransicionaisPresence, ITransicionaisRepo } from "../interfaces/transicionais";

const logger = createLogger("SendAttendanceUsecase");

export interface ISendAttendanceInput {
  attendance: Attendance; // o estado atual da linha, lido do banco (com o updated_at)
  event: CurrentEvent;
  ip: string | null; // IP real (H11); no cron, null
}

const SendAttendanceInputSchema = z.object({
  attendance: z.instanceof(Attendance),
  event: z.instanceof(CurrentEvent),
  ip: z.string().nullable(),
});

export interface ISendAttendanceOutcome {
  sync: AttendanceSync; // como a linha ficou: SYNCED, PENDING ou MANUAL_RETRY (D44, D50: nunca REJECTED)
}

// envio de uma reserva ao Transicionais e a gravação do resultado com a trava do updated_at
// (E2.8, "Escrita da reserva" e "Cron de sincronização"). Usado por ReserveUsecase,
// CancelReservationUsecase e SyncPendingAttendancesUsecase (como o RefreshCurrentEventUsecase, D10).
// Uma falha do envio nunca derruba a reserva local: qualquer erro, inclusive a recusa do Transicionais,
// deixa a linha PENDING até sincronizar de fato (D32, D44)
export class SendAttendanceUsecase {
  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {}

  async execute(input: ISendAttendanceInput): Promise<ISendAttendanceOutcome> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      logger.error({ err: error }, "unexpected error");
      return { sync: AttendanceSync.Pending }; // o cron tenta de novo
    }
  }

  private async _execute(input: ISendAttendanceInput): Promise<ISendAttendanceOutcome> {
    this.validateInput(input);

    if (!this.canSend(input)) {
      return { sync: input.attendance.sync };
    }

    const result = await this.sendTransicionaisAttendance(input);

    return this.markSupabaseSync(result);
  }

  private validateInput(input: ISendAttendanceInput) {
    validateSchema(SendAttendanceInputSchema, input);
  }

  // retrato local da fase 1 (externalId null), linha de ensaio antigo da fase 1 ou que já saiu de
  // PENDING: não envia. Linha de outro dia do Transicionais envia (D45)
  private canSend(input: ISendAttendanceInput): boolean {
    const { attendance, event } = input;

    return (
      event.isFromTransicionais
      && attendance.isFromTransicionaisDay
      && attendance.isPending
      && attendance.updatedAt !== null
    );
  }

  // a presença de lá primeiro (D49): se já é a da linha local (um envio anterior que deu timeout mas
  // foi gravado, por exemplo), marca SYNCED sem reenviar. Senão, dois passos (D41): a conta da pessoa
  // na organização (cadastro idempotente pelo e-mail) e a resposta em nome dela; depois relê a
  // presença para gravar o hash e o orderId. O repo devolve o aceito ou lança; a escolha do SyncMode é
  // daqui (tabela "Tradução das keys do Transicionais" de bff-fase-2-implementacao.md)
  private async sendTransicionaisAttendance(input: ISendAttendanceInput): Promise<IMarkSyncData> {
    const { attendance, event, ip } = input;
    const lock: IMarkSyncLock = { attendanceId: attendance.id, updatedAt: attendance.updatedAt ?? "" };
    const supportTypeIds = this.buildSupportTypeIds(attendance, event);

    try {
      const current = await this.findTransicionaisPresence(attendance);

      if (current && this.isSamePresence(current, attendance, supportTypeIds)) {
        return this.buildSynced(lock, null, current);
      }

      const account = await this.transicionaisRepo.registerGuest({
        email: attendance.user.email,
        name: attendance.user.name,
        pronoun: attendance.user.pronoun,
      });

      await this.transicionaisRepo.sendAttendance({
        attendanceId: attendance.id,
        account,
        dayKey: attendance.dayKey,
        answer: attendance.answer,
        groupId: attendance.answer === AttendanceAnswer.Going ? attendance.groupId : null,
        supportTypeIds,
        ip,
      });

      return this.buildSynced(lock, account.guestId, await this.findSentPresence(attendance));
    } catch (error) {
      return this.buildFailedSend(error, lock);
    }
  }

  private async findTransicionaisPresence(attendance: Attendance): Promise<ITransicionaisPresence | null> {
    return this.transicionaisRepo.findPresence(attendance.dayKey, attendance.user.email);
  }

  // depois do envio aceito, a releitura é só para o hash: se falhar, o envio continua valendo
  private async findSentPresence(attendance: Attendance): Promise<ITransicionaisPresence | null> {
    try {
      return await this.findTransicionaisPresence(attendance);
    } catch (error) {
      logger.warn({ err: error, attendanceId: attendance.id }, "presence not read after send, hash not saved (D49)");
      return null;
    }
  }

  // a resposta, o grupo e as assistências de lá já são os da linha local
  private isSamePresence(presence: ITransicionaisPresence, attendance: Attendance, supportTypeIds: string[]): boolean {
    const groupId = attendance.answer === AttendanceAnswer.Going ? attendance.groupId : null;
    const local = new Set(supportTypeIds);
    const remote = new Set(presence.supportTypeIds);

    return (
      presence.answer === attendance.answer
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
      logger.error({ attendanceId: lock.attendanceId, errorCause: error.errorCause }, "attendance needs a manual retry (D50)");
      return { mode: SyncMode.ManualRetry, ...lock, errorCause: error.errorCause };
    }

    if (error instanceof UpstreamUnavailableError) {
      return { mode: SyncMode.Backoff, ...lock, errorCause: null };
    }

    if (error instanceof AppError) {
      logger.error({ attendanceId: lock.attendanceId, key: error.key }, "attendance refused by Transicionais, stays PENDING (D44)");
      return { mode: SyncMode.Backoff, ...lock, errorCause: null };
    }

    logger.error({ err: error, attendanceId: lock.attendanceId }, "attendance not sent (D32)");
    const errorCause = error instanceof UpstreamResponseError ? error.errorCause : null;

    return { mode: SyncMode.Backoff, ...lock, errorCause };
  }

  // a assistência do instrumento do grupo + os acessórios (E2.9). Só presença ou "não vou": nenhuma
  private buildSupportTypeIds(attendance: Attendance, event: CurrentEvent): string[] {
    if (attendance.answer !== AttendanceAnswer.Going || attendance.groupId === null) {
      return [];
    }

    const instrumentSupportId = event.findGroup(attendance.groupId)?.instrumentSupportId ?? null;
    const supportIds = this.filterOfferedSupportIds(attendance, event, attendance.groupId);

    return instrumentSupportId === null ? supportIds : [instrumentSupportId, ...supportIds];
  }

  // só os acessórios que o encontro oferece para o grupo: a linha migrada da fase 1 (migrar_fase1)
  // ainda tem os ids locais (talabarte, baqueta), que não existem no Transicionais (D42)
  private filterOfferedSupportIds(attendance: Attendance, event: CurrentEvent, groupId: string): string[] {
    const offered = new Set(event.supportsForGroup(groupId).map((support) => support.id));
    const ignored = attendance.supportIds.filter((id) => !offered.has(id));

    if (ignored.length > 0) {
      logger.warn({ attendanceId: attendance.id, ignored }, "support not offered by the event, not sent (D42)");
    }

    return attendance.supportIds.filter((id) => offered.has(id));
  }

  // grava só se a linha ainda é a enviada; se mudou durante o envio, continua PENDING
  private async markSupabaseSync(sync: IMarkSyncData): Promise<ISendAttendanceOutcome> {
    const applied = await this.hormoniosRepo.markSync(sync);

    if (!applied) {
      return { sync: AttendanceSync.Pending };
    }

    if (sync.mode === SyncMode.Synced) {
      return { sync: AttendanceSync.Synced };
    }

    return { sync: sync.mode === SyncMode.ManualRetry ? AttendanceSync.ManualRetry : AttendanceSync.Pending };
  }
}
