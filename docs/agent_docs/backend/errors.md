# Erros (`src/serve-utils/errors/`)

> Índice: [`README.md`](README.md). Quem converte em resposta: [`api.md`](api.md).

## Regras

| # | Regra |
|---|---|
| E1 | Todo erro de domínio estende `AppError`. |
| E2 | Cada erro tem uma `key` **única** em `UPPER_SNAKE_CASE` terminada em `_ERROR`, declarada no enum `ErrorKey` (`AppError.key: ErrorKey`). A `key` é o contrato com o front e é o `sync_error` gravado da reserva recusada. |
| E3 | Cada erro tem o `status` HTTP que a rota vai devolver. |
| E4 | `name` vem da classe (`new.target.name`), para o log mostrar o tipo certo. |
| E5 | Erro inesperado **não** vira `AppError`. O usecase registra (`logger.error({ err }, …)`, [`lib.md`](lib.md)) e relança um erro genérico; a rota responde 500 `INTERNAL_ERROR`. |
| E6 | **Falha de fonte é `InfraError`** (`errors/infra-error.ts`), com `key` (`InfraErrorKey`) e `source` (`InfraSource`): `DatabaseError` (o Supabase devolveu erro), `UpstreamResponseError` (o Transicionais devolveu um status sem tratamento) e `InvalidResponseError` (a resposta não tem o formato do schema, ou o model a recusou). Não é `AppError`: vira 500. |
| E7 | **`throw new Error` só para bug** ou configuração ausente (env). Assim, no log, um erro sem `key` é sempre bug. |
| E8 | **Resultado da fonte que o usecase decide** é `InfraError` próprio, com `key` em `InfraErrorKey`: `AnswerChangedError` (`VALIDATION_ANSWER_CHANGED`: a resposta do convidado mudou ao mesmo tempo; o `SendAttendanceUsecase` deixa o envio `PENDING` para o próximo ciclo) e `VersionConflictError` (`EVENT_VERSION_CONFLICT`: o `UpdateEventUsecase` lê a `version` de novo e tenta uma vez mais). O repo só traduz a `key` (R11); o que fazer é do usecase (R12), por `instanceof`. **Não são `AppError`** porque não são recusa da pessoa nem vão para a tela: se o usecase não os tratar, viram 500 como qualquer falha de fonte. |

## Exemplo

```ts
// src/serve-utils/errors/app-error.ts
export enum ErrorKey {
  InvalidParameter = "INVALID_PARAMETER_ERROR",
  NotFound = "NOT_FOUND_ERROR",
  Unauthorized = "UNAUTHORIZED_ERROR",
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
```

## Exemplo: falha de fonte

```ts
// src/serve-utils/errors/infra-error.ts (trecho)
export enum InfraErrorKey {
  Database = "DATABASE_ERROR",
  UpstreamResponse = "UPSTREAM_RESPONSE_ERROR",
  InvalidResponse = "INVALID_RESPONSE_ERROR",
}

export class DatabaseError extends InfraError {
  readonly key = InfraErrorKey.Database;

  constructor(operation: string, status: number, message: string | undefined) {
    super(InfraSource.Supabase, `${operation} failed with ${status}: ${message}`);
  }
}

// no repo
if (response.error) {
  throw new DatabaseError("listByDay", response.status, response.error.message);
}
```
