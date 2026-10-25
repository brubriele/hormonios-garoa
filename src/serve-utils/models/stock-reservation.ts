import { InvalidParameterError } from "../errors/app-error";

// quem reservou um item do estoque, no resumo da Produção (D30, D31)
export class StockReservation {
  constructor(
    readonly name: string,
    readonly pronoun: string,
    readonly detail: string, // instrumento: os acessórios da pessoa; acessório: o instrumento dela
  ) {
    this.validate();
  }

  private validate() {
    if (typeof this.name !== "string" || typeof this.pronoun !== "string" || typeof this.detail !== "string") {
      throw new InvalidParameterError("Field stockReservation is invalid");
    }
  }
}
