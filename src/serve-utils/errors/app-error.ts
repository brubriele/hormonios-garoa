// a key é o contrato com o front (E2) e o sync_error gravado da reserva recusada
export enum ErrorKey {
  InvalidParameter = "INVALID_PARAMETER_ERROR",
  NotFound = "NOT_FOUND_ERROR",
  Unauthorized = "UNAUTHORIZED_ERROR",
  BookingClosed = "BOOKING_CLOSED_ERROR",
  SoldOut = "SOLD_OUT_ERROR",
  AccessorySoldOut = "ACCESSORY_SOLD_OUT_ERROR",
  AlreadyReserved = "ALREADY_RESERVED_ERROR",
  EventChanged = "EVENT_CHANGED_ERROR",
  StockBelowReservations = "STOCK_BELOW_RESERVATIONS_ERROR",
  UpstreamUnavailable = "UPSTREAM_UNAVAILABLE_ERROR",
  ReservationRejected = "RESERVATION_REJECTED_ERROR",
  EventCreationPending = "EVENT_CREATION_PENDING_ERROR",
}

export abstract class AppError extends Error {
  abstract readonly key: ErrorKey;
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidParameterError extends AppError {
  readonly key = ErrorKey.InvalidParameter;
  readonly status = 400;
}

export class NotFoundError extends AppError {
  readonly key = ErrorKey.NotFound;
  readonly status = 404;
}

export class UnauthorizedError extends AppError {
  readonly key = ErrorKey.Unauthorized;
  readonly status = 401;
}

export class BookingClosedError extends AppError {
  readonly key = ErrorKey.BookingClosed;
  readonly status = 409;
}

export class SoldOutError extends AppError {
  readonly key = ErrorKey.SoldOut;
  readonly status = 409;
}

// o acessório pedido na reserva esgotou (E2.9)
export class AccessorySoldOutError extends AppError {
  readonly key = ErrorKey.AccessorySoldOut;
  readonly status = 409;
}

export class AlreadyReservedError extends AppError {
  readonly key = ErrorKey.AlreadyReserved;
  readonly status = 409;
}

export class EventChangedError extends AppError {
  readonly key = ErrorKey.EventChanged;
  readonly status = 409;
}

export class StockBelowReservationsError extends AppError {
  readonly key = ErrorKey.StockBelowReservations;
  readonly status = 409;
}

// o Transicionais não respondeu (rede, timeout, 429, 5xx) numa ação da Produção
export class UpstreamUnavailableError extends AppError {
  readonly key = ErrorKey.UpstreamUnavailable;
  readonly status = 503;
}

// o Transicionais recusou a reserva por outra regra (não é vaga nem prazo)
export class ReservationRejectedError extends AppError {
  readonly key = ErrorKey.ReservationRejected;
  readonly status = 409;
}

// "Encerrar ensaio" com o anterior ainda só no local, esperando o Transicionais (D51)
export class EventCreationPendingError extends AppError {
  readonly key = ErrorKey.EventCreationPending;
  readonly status = 409;
}
