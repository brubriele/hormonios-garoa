# Clients (`src/serve-utils/clients/`)

> Índice: [`README.md`](README.md). Quem usa: [`repos.md`](repos.md).

## Regras

| # | Regra |
|---|---|
| C1 | O client é **compartilhado** e não conhece domínio: não importa models nem interfaces de fonte. |
| C2 | `404` devolve `null`. Os outros status de erro lançam. Quem decide se `null` é erro é o repo. |
| C3 | Só `fetch` (funciona no Edge). Sem `node:*`. |
| C4 | Um SDK de terceiro (ex.: `supabase-js`) também é criado aqui, uma vez, e passado aos repos. |

## Exemplo

```ts
// src/serve-utils/clients/http-client.ts
export class HttpClient {
  async get<T>(url: string): Promise<T | null> {
    const response = await fetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GET ${url} failed with ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
```
