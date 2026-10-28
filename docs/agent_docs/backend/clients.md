# Clients (`src/bff/clients/`)

> Índice: [`README.md`](README.md). Contrato da resposta: [`interfaces.md`](interfaces.md). Quem usa: [`repos.md`](repos.md).

## Regras

| # | Regra |
|---|---|
| C1 | O client é **compartilhado** e não conhece domínio: não importa domains nem interfaces de fonte. |
| C2 | Todo client devolve **`IClientResponse<T>`** (`{ status, data?, error? }`). Cada client monta essa resposta do seu jeito, a partir do que a sua fonte devolve. |
| C3 | O client **não lança** e não decide o que um status significa. Sucesso preenche `data`. Falha preenche `error`. Quem trata é o repo ([`repos.md`](repos.md), R8). |
| C4 | Falha de rede (sem resposta HTTP) devolve `status: 0` com `error`. |
| C5 | Só `fetch` (funciona no Edge). Sem `node:*`. |
| C6 | Um SDK de terceiro (ex.: `supabase-js`) também é criado aqui, uma vez, e passado aos repos. O resultado dele é convertido para `IClientResponse<T>`. |
| C7 | **Timeout:** toda chamada HTTP tem `AbortSignal.timeout` (padrão 3 s). Estourou → `status: 0`, como falha de rede (C4). |
| C8 | Headers (token, `x-forwarded-for`) entram pelo parâmetro da chamada. O client não conhece token nem env de domínio. |

## Exemplo: HTTP

```ts
// src/bff/clients/http-client.ts
import type { IClientResponse } from "../interfaces/client-response";

export enum HttpMethod {
  Get = "GET",
  Post = "POST",
  Put = "PUT",
  Delete = "DELETE",
}

export interface IHttpRequest {
  method?: HttpMethod; // padrão GET
  url: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number; // padrão 3000 (C7)
}

export class HttpClient {
  async get<T>(url: string, headers?: Record<string, string>): Promise<IClientResponse<T>> {
    return this.request<T>({ url, headers });
  }

  async request<T>(input: IHttpRequest): Promise<IClientResponse<T>> {
    try {
      const response = await fetch(input.url, {
        method: input.method ?? HttpMethod.Get,
        headers: { "content-type": "application/json", ...input.headers },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: AbortSignal.timeout(input.timeoutMs ?? 3000),
      });

      const text = await response.text();
      const json: unknown = text ? JSON.parse(text) : undefined; // 204 vem sem corpo

      if (!response.ok) {
        // details traz o corpo do erro ({ key, message } no Transicionais): o repo decide (C3)
        return { status: response.status, error: { message: response.statusText, details: json } };
      }

      return { status: response.status, data: json as T };
    } catch (error) {
      return {
        status: 0,
        error: { message: error instanceof Error ? error.message : "Request failed", details: error },
      };
    }
  }
}
```

## Exemplo: SDK

O `supabase-js` já devolve `{ data, error, status }`. O client cria o SDK uma vez, na primeira
chamada, e só ajusta o resultado ao contrato. O repo monta a consulta em `query(...)`.

```ts
// src/bff/clients/supabase-client.ts
import { createClient, type SupabaseClient as Sdk } from "@supabase/supabase-js";
import type { IClientResponse } from "../interfaces/client-response";

interface ISdkResult<T> {
  data: T | null;
  error: { message: string } | null;
  status: number;
}

export class SupabaseClient {
  private sdk?: Sdk;

  // criado na primeira chamada: env ausente quebra na hora certa
  private get client(): Sdk {
    if (!this.sdk) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!url || !key) {
        throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set");
      }

      this.sdk = createClient(url, key, { auth: { persistSession: false } });
    }

    return this.sdk;
  }

  async query<T>(build: (sdk: Sdk) => PromiseLike<ISdkResult<T>>): Promise<IClientResponse<T>> {
    try {
      const { data, error, status } = await build(this.client);

      if (error) {
        return { status, error: { message: error.message, details: error } };
      }

      return { status, data: data ?? undefined };
    } catch (error) {
      return {
        status: 0,
        error: { message: error instanceof Error ? error.message : "Request failed", details: error },
      };
    }
  }
}
```
