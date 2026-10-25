import { AppError } from "../errors/app-error";
import type { Attendance, AttendanceSync } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { ISendAttendanceResult, ITransicionaisRepo } from "../interfaces/transicionais";

export interface ISendAttendanceInput {
  attendance: Attendance; // o estado atual da linha, lido do banco (com o updated_at)
  event: CurrentEvent;
  ip: string | null; // IP real (H11); no cron, null
}

export interface ISendAttendanceOutcome {
  sync: AttendanceSync; // como a linha ficou
  error: AppError | null; // a recusa traduzida, quando a linha ficou REJECTED
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
      console.error("[SendAttendanceUsecase]", error);
      return { sync: "PENDING", error: null }; // o cron tenta de novo
    }
  }

  private async _execute(input: ISendAttendanceInput): Promise<ISendAttendanceOutcome> {
    if (!this.canSend(input)) {
      return { sync: input.attendance.sync, error: null };
    }

    const result = await this.sendTransicionaisAttendance(input);

    return this.markSupabaseSync(input.attendance, result);
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

  private async sendTransicionaisAttendance(input: ISendAttendanceInput): Promise<ISendAttendanceResult> {
    const { attendance, event, ip } = input;

    return this.transicionaisRepo.sendAttendance({
      attendanceId: attendance.id,
      updatedAt: attendance.updatedAt ?? "",
      dayKey: attendance.dayKey,
      answer: attendance.answer,
      groupId: attendance.answer === "vou" ? attendance.groupId : null,
      supportTypeIds: this.buildSupportTypeIds(attendance, event),
      person: { email: attendance.user.email, name: attendance.user.name, pronoun: attendance.user.pronoun },
      ip,
    });
  }

  // a assistência do instrumento do grupo + os acessórios (E2.9). Só presença ou "não vou": nenhuma
  private buildSupportTypeIds(attendance: Attendance, event: CurrentEvent): string[] {
    if (attendance.answer !== "vou" || attendance.groupId === null) {
      return [];
    }

    const instrumentSupportId = event.findGroup(attendance.groupId)?.instrumentSupportId ?? null;

    return instrumentSupportId === null
      ? attendance.supportIds
      : [instrumentSupportId, ...attendance.supportIds];
  }

  // grava só se a linha ainda é a enviada; se mudou durante o envio, continua PENDING
  private async markSupabaseSync(attendance: Attendance, result: ISendAttendanceResult): Promise<ISendAttendanceOutcome> {
    const lock = { attendanceId: attendance.id, updatedAt: attendance.updatedAt ?? "" };

    if (result.status === "SYNCED") {
      const applied = await this.hormoniosRepo.markSync({
        mode: "SYNCED",
        ...lock,
        orderId: result.orderId,
        changedAt: result.changedAt,
        guestId: result.guestId,
      });

      return { sync: applied ? "SYNCED" : "PENDING", error: null };
    }

    if (result.status === "REJECTED") {
      const applied = await this.hormoniosRepo.markSync({ mode: "REJECTED", ...lock, error: result.error.key });

      return applied ? { sync: "REJECTED", error: result.error } : { sync: "PENDING", error: null };
    }

    await this.hormoniosRepo.markSync({ mode: result.retryNow ? "RETRY" : "BACKOFF", ...lock });

    return { sync: "PENDING", error: null };
  }
}
