import { z } from "zod";
import { AppError } from "../../errors/app-error";
import { createLogger } from "../../lib/logger";
import { type Booking, BookingAnswer } from "../../models/booking";
import type { CurrentEvent } from "../../models/current-event";
import { UuidSchema, validateSchema } from "../../models/model-schema";
import type { UserBooking } from "../../models/user-booking";
import type { IHormoniosRepo } from "../../interfaces/hormonios";
import type { UUID } from "../../interfaces/uuid";
import { UserBookingMapper } from "./mappers/user-booking.mapper";

const logger = createLogger("FindingUserBookingsUsecase");

export interface IFindingUserBookingsInput {
  deviceId: UUID;
}

const FindingUserBookingsInputSchema = z.object({
  deviceId: UuidSchema,
});

export class FindingUserBookingsUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(input: IFindingUserBookingsInput): Promise<UserBooking[]> {
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

  private async _execute(input: IFindingUserBookingsInput): Promise<UserBooking[]> {
    this.validateInput(input);

    const event = await this.findSupabaseCurrentEvent();
    const bookings = await this.findSupabaseDeviceBookings(event, input.deviceId);

    return bookings.map((booking) => UserBookingMapper.toView(event, booking));
  }

  private validateInput(input: IFindingUserBookingsInput) {
    validateSchema(FindingUserBookingsInputSchema, input);
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // só as linhas "vou", com e sem instrumento, inclusive as REJECTED (a tela mostra a recusa)
  private async findSupabaseDeviceBookings(event: CurrentEvent, deviceId: UUID): Promise<Booking[]> {
    const bookings = await this.hormoniosRepo.listByDevice({ dayKey: event.dayKey, deviceId });

    return bookings.filter((booking) => booking.answer === BookingAnswer.Going);
  }
}
