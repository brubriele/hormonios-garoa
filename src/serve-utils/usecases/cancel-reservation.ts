import { AppError, InvalidParameterError } from "../errors/app-error";
import type { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import type { UUID } from "../interfaces/uuid";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ICancelReservationInput {
  id: UUID;
  deviceId: UUID;
}

export class CancelReservationUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(input: ICancelReservationInput): Promise<void> {
    try {
      return await this._execute(input); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[CancelReservationUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  private async _execute(input: ICancelReservationInput): Promise<void> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent();

    // "Não vou": answer nao-vou, sem grupo e sem acessórios; NotFoundError se não for deste aparelho
    await this.hormoniosRepo.cancelByDevice({
      dayKey: event.dayKey,
      deviceId: input.deviceId,
      attendanceId: input.id,
    });
  }

  private validateInput(input: ICancelReservationInput) {
    if (typeof input.id !== "string" || !UUID_PATTERN.test(input.id)) {
      throw new InvalidParameterError("Field id is invalid");
    }
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }
}
