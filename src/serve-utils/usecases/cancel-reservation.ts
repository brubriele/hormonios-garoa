import { AppError, InvalidParameterError } from "../errors/app-error";
import { createLogger } from "../lib/logger";
import type { Attendance } from "../models/attendance";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { ITransicionaisRepo } from "../interfaces/transicionais";
import type { UUID } from "../interfaces/uuid";
import { SendAttendanceUsecase } from "./send-attendance";

const logger = createLogger("CancelReservationUsecase");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// o corpo do POST /api/reserva/desfazer
export interface ICancelReservationBody {
  id: UUID;
}

export interface ICancelReservationInput extends ICancelReservationBody {
  deviceId: UUID;
  ip: string | null; // IP real (H11), repassado ao Transicionais
}

export class CancelReservationUsecase {
  private readonly sendAttendance: SendAttendanceUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.sendAttendance = new SendAttendanceUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: ICancelReservationInput): Promise<void> {
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

  private async _execute(input: ICancelReservationInput): Promise<void> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent();

    const attendance = await this.cancelSupabaseAttendance(input, event);

    await this.sendTransicionaisAttendance(attendance, event, input.ip);
  }

  private validateInput(input: ICancelReservationInput) {
    if (typeof input.id !== "string" || !UUID_PATTERN.test(input.id)) {
      throw new InvalidParameterError("Field id is invalid");
    }
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // "Não vou": answer nao-vou, sem grupo e sem acessórios; NotFoundError se não for deste aparelho
  private async cancelSupabaseAttendance(input: ICancelReservationInput, event: CurrentEvent): Promise<Attendance> {
    return this.hormoniosRepo.cancelByDevice({
      dayKey: event.dayKey,
      deviceId: input.deviceId,
      attendanceId: input.id,
    });
  }

  // envia DECLINED na hora. Recusou: a linha fica REJECTED e a rota responde o erro traduzido
  // (dúvida D34). Fora ou lento: PENDING, o cron envia depois
  private async sendTransicionaisAttendance(attendance: Attendance, event: CurrentEvent, ip: string | null) {
    const outcome = await this.sendAttendance.execute({ attendance, event, ip });

    if (outcome.error) {
      throw outcome.error;
    }
  }
}
