# Interfaces (`src/serve-utils/interfaces/`)

> Índice: [`README.md`](README.md). Quem implementa: [`repos.md`](repos.md). Quem usa: [`usecases.md`](usecases.md).

## Regras

| # | Regra |
|---|---|
| I1 | Interface começa com `I` (`ITransicionaisRepo`, `IFindEventFilter`). |
| I2 | **Todo repo tem interface.** O usecase recebe a interface, para o teste trocar por um fake. |
| I3 | O formato cru que vem de fora é `IRaw<Nome>`. Só o repo usa esse tipo. |
| I4 | Filtros de busca são `IFind<Nome>Filter`. Entradas de usecase são `I<Usecase>Input`. |
| I5 | Um arquivo por fonte (`transicionais.ts`, `supabase.ts`). Tipos comuns, como `UUID`, ficam em arquivo próprio. |

## Exemplo

```ts
// src/serve-utils/interfaces/uuid.ts
export type UUID = `${string}-${string}-${string}-${string}-${string}`;
```

```ts
// src/serve-utils/interfaces/client-response.ts
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
// src/serve-utils/interfaces/transicionais.ts
import type { BasicEvent } from "../models/basic-event";
import type { UUID } from "./uuid";

// formato cru que a API devolve; nunca sai do repo
export interface IRawEvent {
  id: UUID;
  name: string;
}

export interface IFindEventFilter {
  id: UUID;
}

export interface ITransicionaisRepo {
  findEvent(filter: IFindEventFilter): Promise<BasicEvent | null>;
  findEventOrFail(filter: IFindEventFilter): Promise<BasicEvent>;
}
```
