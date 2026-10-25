export abstract class AppError extends Error {
  abstract readonly key: string;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidParameterError extends AppError {
  readonly key = "INVALID_PARAMETER_ERROR";
  readonly status = 400;
}

export class NotFoundError extends AppError {
  readonly key = "NOT_FOUND_ERROR";
  readonly status = 404;
}

export class UnauthorizedError extends AppError {
  readonly key = "UNAUTHORIZED_ERROR";
  readonly status = 401;
}

export class BookingClosedError extends AppError {
  readonly key = "BOOKING_CLOSED_ERROR";
  readonly status = 409;
}

export class SoldOutError extends AppError {
  readonly key = "SOLD_OUT_ERROR";
  readonly status = 409;
}

// o acessório pedido na reserva esgotou (E2.9)
export class AccessorySoldOutError extends AppError {
  readonly key = "ACCESSORY_SOLD_OUT_ERROR";
  readonly status = 409;
}

export class AlreadyReservedError extends AppError {
  readonly key = "ALREADY_RESERVED_ERROR";
  readonly status = 409;
}

export class EventChangedError extends AppError {
  readonly key = "EVENT_CHANGED_ERROR";
  readonly status = 409;
}

export class StockBelowReservationsError extends AppError {
  readonly key = "STOCK_BELOW_RESERVATIONS_ERROR";
  readonly status = 409;
}

// o Transicionais não respondeu (rede, timeout, 429, 5xx) numa ação da Produção
export class UpstreamUnavailableError extends AppError {
  readonly key = "UPSTREAM_UNAVAILABLE_ERROR";
  readonly status = 503;
}

// o Transicionais recusou a reserva por outra regra (não é vaga nem prazo)
export class ReservationRejectedError extends AppError {
  readonly key = "RESERVATION_REJECTED_ERROR";
  readonly status = 409;
}
