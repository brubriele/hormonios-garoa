import { ErrorCtx } from "../domain/IntegrationStatus";
import { AppError } from "../errors/app-error";
import { InfraError, UpstreamBadContractError, UpstreamResponseError } from "../errors/infra-error";
import type { ITransicionaisErrorCause } from "../interfaces/transicionais";

// a fonte não chegou a responder: rede ou timeout (status 0), 429 ou 5xx. É "fora do ar", não recusa
export function isUnavailable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

// a fonte recusou o contrato (400, 409, 422): repetir igual não resolve, precisa de ajuste manual (D50)
export function isBadContract(status: number): boolean {
  return status === 400 || status === 409 || status === 422;
}

function readText(body: unknown, field: string): string | null {
  if (body === null || typeof body !== "object") {
    return null;
  }

  const value = (body as Record<string, unknown>)[field];

  if (value === undefined || value === null) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function fromCause(cause: ITransicionaisErrorCause): ErrorCtx {
  const error = readText(cause.body, "error");
  const key = readText(cause.body, "key");
  const message = readText(cause.body, "message");

  return new ErrorCtx(cause.status, error, key, message);
}

export function toErrorCtx(error: unknown): ErrorCtx {
  const isUpstream = error instanceof UpstreamBadContractError || error instanceof UpstreamResponseError;

  if (isUpstream && error.errorCause) {
    return fromCause(error.errorCause);
  }

  if (error instanceof AppError) {
    return new ErrorCtx(error.status, error.name, error.key, error.message);
  }

  if (error instanceof InfraError) {
    return new ErrorCtx(0, error.name, error.key, error.message);
  }

  if (error instanceof Error) {
    return new ErrorCtx(0, error.name, null, error.message);
  }

  return new ErrorCtx(0, null, null, String(error));
}

// K1: TRANSICIONAIS_ENABLED=false desliga; ausente ou outro valor = ligado
export function isTransicionaisEnabled(): boolean {
  return process.env.TRANSICIONAIS_ENABLED !== "false";
}
