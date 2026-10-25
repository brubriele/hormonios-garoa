import { InvalidParameterError } from "../errors/app-error";
import { StockReservation } from "./stock-reservation";
import { SupportTypeKind } from "./support-type";

// um item do estoque no resumo da Produção (E2.9): o instrumento ou o acessório, com as vagas
export class StockItem {
  constructor(
    readonly id: string, // assistência (supportId); o do instrumento é o instrumentSupportId do grupo
    readonly name: string,
    readonly type: SupportTypeKind,
    readonly stockTotal: number | null, // null = sem limite
    readonly available: number | null, // null = sem limite
    readonly rotativo: boolean,
    readonly reservations: StockReservation[],
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.id !== "string" || this.id.trim() === "") {
      throw new InvalidParameterError("Field stockItem.id is invalid");
    }

    if (typeof this.name !== "string") {
      throw new InvalidParameterError("Field stockItem.name is invalid");
    }

    if (!Object.values(SupportTypeKind).includes(this.type)) {
      throw new InvalidParameterError("Field stockItem.type is invalid");
    }

    if (this.stockTotal !== null && (!Number.isInteger(this.stockTotal) || this.stockTotal < 0)) {
      throw new InvalidParameterError("Field stockItem.stockTotal is invalid");
    }

    if (this.available !== null && (!Number.isInteger(this.available) || this.available < 0)) {
      throw new InvalidParameterError("Field stockItem.available is invalid");
    }

    if (typeof this.rotativo !== "boolean") {
      throw new InvalidParameterError("Field stockItem.rotativo is invalid");
    }

    if (!Array.isArray(this.reservations) || this.reservations.some((item) => !(item instanceof StockReservation))) {
      throw new InvalidParameterError("Field stockItem.reservations is invalid");
    }
  }
}
