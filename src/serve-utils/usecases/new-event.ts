import { AppError } from "../errors/app-error";
import { CurrentEvent } from "../models/current-event";
import type { IHormoniosRepo } from "../interfaces/hormonios";
import { toAdminSummary, type IAdminSummary } from "./event-summary";

const DEFAULT_LOCATION = "A definir";

export class NewEventUsecase {
  constructor(private readonly hormoniosRepo: IHormoniosRepo) {}

  async execute(): Promise<IAdminSummary> {
    try {
      return await this._execute(); // sem await o catch nao pega a rejeicao
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      console.error("[NewEventUsecase]", error);
      throw new Error("Unexpected error");
    }
  }

  // as linhas antigas ficam com o dayKey anterior
  private async _execute(): Promise<IAdminSummary> {
    const event = await this.findSupabaseCurrentEvent();
    const next = this.buildNextEvent(event);
    const saved = await this.hormoniosRepo.saveCurrentEvent(next);

    return toAdminSummary(saved, []); // ensaio novo: ainda sem presenças
  }

  private async findSupabaseCurrentEvent(): Promise<CurrentEvent> {
    return this.hormoniosRepo.findCurrentEventOrFail();
  }

  // novo dayKey, fechado, sem data e hora; mantém WhatsApp, grupos e acessórios
  private buildNextEvent(event: CurrentEvent): CurrentEvent {
    return new CurrentEvent(
      globalThis.crypto.randomUUID(),
      "",
      "",
      DEFAULT_LOCATION,
      false,
      event.whatsappUrl,
      event.groups,
      event.supports,
    );
  }
}
