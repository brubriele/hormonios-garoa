# Erros (`src/serve-utils/errors/`)

> Índice: [`README.md`](README.md). Quem converte em resposta: [`api.md`](api.md).

## Regras

| # | Regra |
|---|---|
| E1 | Todo erro de domínio estende `AppError`. |
| E2 | Cada erro tem uma `key` **única** em `UPPER_SNAKE_CASE` terminada em `_ERROR`. A `key` é o contrato com o front. |
| E3 | Cada erro tem o `status` HTTP que a rota vai devolver. |
| E4 | `name` vem da classe (`new.target.name`), para o log mostrar o tipo certo. |
| E5 | Erro inesperado (rede, bug) **não** vira `AppError`. O usecase registra e relança um erro genérico. |

## Exemplo

```ts
// src/serve-utils/errors/app-error.ts
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
```
