# Interfaces (`src/bff/interfaces/`)

> Índice: [`README.md`](README.md). Quem implementa: [`repos.md`](repos.md). Quem usa: [`usecases.md`](usecases.md).

## Regras

| # | Regra |
|---|---|
| I1 | Interface começa com `I` (`ITransicionaisRepo`, `IFindEventFilter`). |
| I2 | **Todo repo tem interface.** O usecase recebe a interface, para o teste trocar por um fake. |
| I3 | **O formato cru não fica aqui.** Ele é o schema zod do response ou do request, na pasta da fonte ([`requests-responses.md`](requests-responses.md)). Os `IRaw*` que ainda existem em `interfaces/` são legado da fase 2 e saem a cada refatoração. |
| I4 | Filtros de busca do repo são `IFind<Nome>Filter`, com **campos nomeados e opcionais** (`{ id?, email?, integrationId? }`): o primeiro campo preenchido decide a busca (R14). Entradas de usecase são `I<Usecase>Input`; o filtro que **entra num usecase** é domain (M12). |
| I5 | Um arquivo por fonte (`transicionais.ts`, `hormonios.ts`), com a interface do repo e os tipos de entrada e filtro. Tipos comuns, como `UUID`, ficam em arquivo próprio. |
| I6 | **Tipos fechados são enum, não texto.** Um campo com conjunto fechado de valores usa o enum do domain (`BookingSync`, `ErrorKey`), e nunca `string` ou união de strings (`"PENDING" \| "SYNCED"`). Objeto aninhado ganha um tipo com nome; nada de objeto anônimo dentro da interface. |
| I7 | Cada campo é `?:` **ou** `\| null`, nunca os dois. `?:` = pode não vir; `\| null` = vem, e sem valor. |

## Exemplo

```ts
// src/bff/interfaces/uuid.ts
export type UUID = `${string}-${string}-${string}-${string}-${string}`;
```

```ts
// src/bff/interfaces/client-response.ts
// resposta padrão de todo client (ver clients.md)
export interface IClientError {
  message: string;
  details?: unknown;
}

export interface IClientResponse<T> {
  status: number; // status HTTP; 0 quando não houve resposta
  data?: T;
  error?: IClientError;
}
```

```ts
// src/bff/interfaces/transicionais.ts
import type { BasicEvent } from "../domain/basic-event";
import type { UUID } from "./uuid";

// o formato cru da API fica no schema do response (repos/transicionais/responses/)

export interface IFindEventFilter {
  id: UUID;
}

export interface ITransicionaisRepo {
  findEvent(filter: IFindEventFilter): Promise<BasicEvent | null>;
  findEventOrFail(filter: IFindEventFilter): Promise<BasicEvent>;
}
```
