import { InvalidParameterError } from "../errors/app-error";
import { StockItem } from "./stock-item";

// o ensaio no resumo da Produção: o retrato com o estoque (instrumentos e depois acessórios)
export class AdminEvent {
  constructor(
    readonly dayKey: string,
    readonly date: string, // vazia = a definir
    readonly time: string, // vazia = a definir
    readonly location: string,
    readonly bookingOpen: boolean,
    readonly whatsappUrl: string,
    readonly goingCount: number, // linhas "vou" que não estão REJECTED (D8)
    readonly stock: StockItem[],
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.dayKey !== "string" || this.dayKey.trim() === "") {
      throw new InvalidParameterError("Field adminEvent.dayKey is invalid");
    }

    if (typeof this.date !== "string" || typeof this.time !== "string" || typeof this.location !== "string") {
      throw new InvalidParameterError("Field adminEvent.date, time or location is invalid");
    }

    if (typeof this.bookingOpen !== "boolean") {
      throw new InvalidParameterError("Field adminEvent.bookingOpen is invalid");
    }

    if (typeof this.whatsappUrl !== "string") {
      throw new InvalidParameterError("Field adminEvent.whatsappUrl is invalid");
    }

    if (!Number.isInteger(this.goingCount) || this.goingCount < 0) {
      throw new InvalidParameterError("Field adminEvent.goingCount is invalid");
    }

    if (!Array.isArray(this.stock) || this.stock.some((item) => !(item instanceof StockItem))) {
      throw new InvalidParameterError("Field adminEvent.stock is invalid");
    }
  }
}
