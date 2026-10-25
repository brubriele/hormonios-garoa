import { AppError, UpstreamUnavailableError } from "../errors/app-error";
import { AnswerChangedError } from "../errors/infra-error";
import { createLogger } from "../lib/logger";
import { type Attendance, AttendanceAnswer, AttendanceSync, SyncMode } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo, IMarkSyncData, IMarkSyncLock } from "../interfaces/hormonios";
import type { ITransicionaisRepo } from "../interfaces/transicionais";

const logger = createLogger("SendAttendanceUsecase");

export interface ISendAttendanceInput {
  attendance: Attendance; // o estado atual da linha, lido do banco (com o updated_at)
  event: CurrentEvent;
  ip: string | null; // IP real (H11); no cron, null
}

export interface ISendAttendanceOutcome {
  sync: AttendanceSync; // como a linha ficou
  error: AppError | null; // a recusa traduzida, quando a linha ficou REJECTED
}

// o resultado do envio: como gravar (marcar_sync) e a recusa traduzida, quando REJECTED
interface ISendResult {
  sync: IMarkSyncData;
  error: AppError | null;
}

// envio de uma reserva ao Transicionais e a gravação do resultado com a trava do updated_at
// (E2.8, "Escrita da reserva" e "Cron de sincronização"). Usado por ReserveUsecase,
// CancelReservationUsecase e SyncPendingAttendancesUsecase (como o RefreshCurrentEventUsecase, D10).
// Uma falha do envio nunca derruba a reserva local: qualquer erro vira PENDING (dúvida D32)
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
      return { sync: AttendanceSync.Pending, error: null }; // o cron tenta de novo
    }
  }

  private async _execute(input: ISendAttendanceInput): Promise<ISendAttendanceOutcome> {
    if (!this.canSend(input)) {
      return { sync: input.attendance.sync, error: null };
    }

    const result = await this.sendTransicionaisAttendance(input);

    return this.markSupabaseSync(result);
  }

  // retrato local da fase 1 (externalId null), linha de outro dia ou que já saiu de PENDING: não envia
  private canSend(input: ISendAttendanceInput): boolean {
    const { attendance, event } = input;

    return (
      event.isFromTransicionais
      && attendance.dayKey === event.dayKey
      && attendance.isPending
      && attendance.updatedAt !== null
    );
  }

  // o repo devolve o aceito ou lança; a escolha do SyncMode é daqui (tabela "Tradução das keys do
  // Transicionais" de bff-fase-2-implementacao.md)
  private async sendTransicionaisAttendance(input: ISendAttendanceInput): Promise<ISendResult> {
    const { attendance, event, ip } = input;
    const lock: IMarkSyncLock = { attendanceId: attendance.id, updatedAt: attendance.updatedAt ?? "" };

    try {
      const sent = await this.transicionaisRepo.sendAttendance({
        attendanceId: attendance.id,
        updatedAt: attendance.updatedAt ?? "",
        dayKey: attendance.dayKey,
        answer: attendance.answer,
        groupId: attendance.answer === AttendanceAnswer.Going ? attendance.groupId : null,
        supportTypeIds: this.buildSupportTypeIds(attendance, event),
        person: { email: attendance.user.email, name: attendance.user.name, pronoun: attendance.user.pronoun },
        ip,
      });

      return { sync: { mode: SyncMode.Synced, ...lock, ...sent }, error: null };
    } catch (error) {
      return this.buildFailedSend(error, lock);
    }
  }

  // a resposta mudou no Transicionais: próximo ciclo. Recusa (AppError): REJECTED. Fora do ar, 401/403
  // depois de renovar ou qualquer outra falha: espera crescente (D32: nunca derruba a reserva local)
  private buildFailedSend(error: unknown, lock: IMarkSyncLock): ISendResult {
    if (error instanceof AnswerChangedError) {
      return { sync: { mode: SyncMode.Retry, ...lock }, error: null };
    }

    if (error instanceof UpstreamUnavailableError) {
      return { sync: { mode: SyncMode.Backoff, ...lock }, error: null };
    }

    if (error instanceof AppError) {
      return { sync: { mode: SyncMode.Rejected, ...lock, error: error.key }, error };
    }

    logger.error({ err: error, attendanceId: lock.attendanceId }, "attendance not sent (D32)");
    return { sync: { mode: SyncMode.Backoff, ...lock }, error: null };
  }

  // a assistência do instrumento do grupo + os acessórios (E2.9). Só presença ou "não vou": nenhuma
  private buildSupportTypeIds(attendance: Attendance, event: CurrentEvent): string[] {
    if (attendance.answer !== AttendanceAnswer.Going || attendance.groupId === null) {
      return [];
    }

    const instrumentSupportId = event.findGroup(attendance.groupId)?.instrumentSupportId ?? null;

    return instrumentSupportId === null
      ? attendance.supportIds
      : [instrumentSupportId, ...attendance.supportIds];
  }

  // grava só se a linha ainda é a enviada; se mudou durante o envio, continua PENDING
  private async markSupabaseSync(result: ISendResult): Promise<ISendAttendanceOutcome> {
    const applied = await this.hormoniosRepo.markSync(result.sync);

    if (result.sync.mode === SyncMode.Synced) {
      return { sync: applied ? AttendanceSync.Synced : AttendanceSync.Pending, error: null };
    }

    if (result.sync.mode === SyncMode.Rejected) {
      return applied
        ? { sync: AttendanceSync.Rejected, error: result.error }
        : { sync: AttendanceSync.Pending, error: null };
    }

    return { sync: AttendanceSync.Pending, error: null };
  }
}
