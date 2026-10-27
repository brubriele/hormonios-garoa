import type { ZodError } from "zod";
import type { ITransicionaisErrorCause } from "../interfaces/transicionais";
import { InvalidParameterError } from "./app-error";

// falha de uma fonte (Supabase, Transicionais). Não é AppError: a rota responde 500 INTERNAL_ERROR
// (E5). A key separa a falha da fonte de um bug (Error sem key) no log
export enum InfraErrorKey {
  Database = "DATABASE_ERROR",
  UpstreamResponse = "UPSTREAM_RESPONSE_ERROR",
  InvalidResponse = "INVALID_RESPONSE_ERROR",
  AnswerChanged = "ANSWER_CHANGED_ERROR",
  VersionConflict = "VERSION_CONFLICT_ERROR",
  UpstreamBadContract = "UPSTREAM_BAD_CONTRACT_ERROR",
}

export enum InfraSource {
  Supabase = "supabase",
  Transicionais = "transicionais",
}

export abstract class InfraError extends Error {
  abstract readonly key: InfraErrorKey;

  constructor(
    readonly source: InfraSource,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// o Supabase devolveu erro
export class DatabaseError extends InfraError {
  readonly key = InfraErrorKey.Database;

  constructor(operation: string, status: number, message: string | undefined) {
    super(InfraSource.Supabase, `${operation} failed with ${status}: ${message}`);
    
    console.log(this)
  }
}

// o Transicionais devolveu um status sem tratamento
export class UpstreamResponseError extends InfraError {
  readonly key = InfraErrorKey.UpstreamResponse;

  constructor(
    operation: string,
    status: number,
    detail: string | undefined,
    readonly errorCause: ITransicionaisErrorCause | null = null, // o erro como veio, para gravar (D50)
  ) {
    super(InfraSource.Transicionais, `${operation} failed with ${status}: ${detail}`);
  }
}

// o Transicionais recusou o contrato (400, 409 ou 422, isBadContract): repetir igual não resolve,
// precisa de ajuste manual. O usecase grava o erro como veio e MANUAL_RETRY (D50)
export class UpstreamBadContractError extends InfraError {
  readonly key = InfraErrorKey.UpstreamBadContract;

  constructor(readonly errorCause: ITransicionaisErrorCause) {
    super(InfraSource.Transicionais, `${errorCause.operation} rejected with ${errorCause.status}`);
  }
}

// a resposta não tem o formato esperado (schema zod do response ou model inválido)
export class InvalidResponseError extends InfraError {
  readonly key = InfraErrorKey.InvalidResponse;

  constructor(source: InfraSource, operation: string, detail: string) {
    super(source, `${operation} is invalid: ${detail}`);
  }

  // o caminho de cada campo recusado pelo zod
  static fromZod(source: InfraSource, operation: string, error: ZodError): InvalidResponseError {
    const detail = error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"} ${issue.message}`).join("; ");

    return new InvalidResponseError(source, operation, detail);
  }

  // o model recusou o dado da fonte: é resposta inválida (500), não parâmetro da pessoa (400)
  static guard<T>(source: InfraSource, operation: string, build: () => T): T {
    try {
      return build();
    } catch (error) {
      if (error instanceof InvalidParameterError) {
        throw new InvalidResponseError(source, operation, error.message);
      }

      throw error;
    }
  }
}

// a resposta do convidado mudou ao mesmo tempo no Transicionais (VALIDATION_ANSWER_CHANGED, VAL-19).
// Não é recusa da pessoa nem vai para a tela: o envio fica PENDING para o próximo ciclo
export class AnswerChangedError extends InfraError {
  readonly key = InfraErrorKey.AnswerChanged;

  constructor(operation: string) {
    super(InfraSource.Transicionais, `${operation} answer changed at the same time`);
  }
}

// outra escrita mudou o encontro entre a leitura e o salvamento (EVENT_VERSION_CONFLICT). O usecase lê a
// version de novo e tenta uma vez mais; se repetir, vira 500
export class VersionConflictError extends InfraError {
  readonly key = InfraErrorKey.VersionConflict;

  constructor(operation: string) {
    super(InfraSource.Transicionais, `${operation} version conflict`);
  }
}
