import { z } from "zod";
import { AppError } from "../../errors/app-error";
import { createLogger } from "../../lib/logger";
import type { Booking } from "../../models/booking";
import type { CurrentEvent } from "../../models/current-event";
import { UuidSchema, validateSchema } from "../../models/model-schema";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { ITransicionaisRepo } from "../../interfaces/transicionais";
import type { UUID } from "../../interfaces/uuid";
import { SyncingUserBookingUsecase } from "../sync/syncing-user-booking";

const logger = createLogger("CancelingUserBookingUsecase");

const CancelingUserBookingInputSchema = z.object({
  id: UuidSchema,
  deviceId: UuidSchema,
  ip: z.string().nullable(),
});

// o corpo do POST /api/reserva/desfazer
export interface ICancelingUserBookingBody {
  id: UUID;
}

export interface ICancelingUserBookingInput extends ICancelingUserBookingBody {
  deviceId: UUID;
  ip: string | null; // IP real (H11), repassado ao Transicionais
}

export class CancelingUserBookingUsecase {
  private readonly syncingUserBooking: SyncingUserBookingUsecase;

  constructor(
    private readonly hormoniosRepo: IHormoniosRepo,
    private readonly transicionaisRepo: ITransicionaisRepo,
  ) {
    this.syncingUserBooking = new SyncingUserBookingUsecase(this.hormoniosRepo, this.transicionaisRepo);
  }

  async execute(input: ICancelingUserBookingInput): Promise<void> {
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

  private async _execute(input: ICancelingUserBookingInput): Promise<void> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent();

    const booking = await this.cancelSupabaseBooking(input, event);

    await this.sendTransicionaisBooking(booking, event, input.ip);
  }

  private validateInput(input: ICancelingUserBookingInput) {
    validateSchema(CancelingUserBookingInputSchema, input);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // "Não vou": answer nao-vou, sem grupo e sem acessórios; NotFoundError se não for deste aparelho
  private async cancelSupabaseBooking(input: ICancelingUserBookingInput, event: CurrentEvent): Promise<Booking> {
    return this.hormoniosRepo.cancelByDevice({
      dayKey: event.dayKey,
      deviceId: input.deviceId,
      bookingId: input.id,
    });
  }

  // envia DECLINED na hora. Qualquer falha, inclusive a recusa do Transicionais, deixa a linha PENDING,
  // e o cron envia depois (D44)
  private async sendTransicionaisBooking(booking: Booking, event: CurrentEvent, ip: string | null) {
    await this.syncingUserBooking.execute({ booking, event, ip });
  }
}
