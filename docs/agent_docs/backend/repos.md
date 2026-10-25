# Repos e UrlCollection (`src/serve-utils/repos/<fonte>/`)

> Índice: [`README.md`](README.md). Usa: [`clients.md`](clients.md), [`interfaces.md`](interfaces.md), [`models.md`](models.md).
> Tradução do formato cru: [`requests-responses.md`](requests-responses.md).
> Contrato do Transicionais: seção "Contrato do Transicionais" da skill `code-pattern`
> (`.claude/skills/code-pattern/SKILL.md`). Ele é só referência para a tradução nos responses e
> requests. Não dita os nomes nem os formatos do Hormônios.

Cada fonte (API externa ou SDK) tem uma pasta com `url-collection.ts` + `repo.ts` + `responses/` e
`requests/`. Uma fonte sem URL própria, como o Supabase via SDK, não tem `url-collection.ts`.

**O repo só faz I/O:** monta a chamada, trata o status e traduz pelo response/request. Regra de
negócio fica no usecase (R12).

## Regras

| # | Regra |
|---|---|
| R1 | **UrlCollection** tem só métodos estáticos que montam URL. Nenhuma URL é escrita fora dela. |
| R2 | A env (`TRANSICIONAIS_URL`) é lida **na chamada**, não no import, e lança se estiver vazia. |
| R3 | Parâmetro de caminho passa por `encodeURIComponent`. |
| R4 | O repo implementa a interface da fonte (`implements ITransicionaisRepo`). |
| R5 | O repo converte pela classe da finalidade: `XResponse.toDomain(raw)` na volta e `XRequest.fromDomain(model)` na ida ([`requests-responses.md`](requests-responses.md)). **Sem `mapper*` no repo.** O client é chamado com `unknown` (`query<unknown>`, `get<unknown>`): quem dá o tipo é o schema. |
| R6 | `find<Nome>` devolve `T \| null`. `find<Nome>OrFail` chama o `find` e lança `NotFoundError`. |
| R7 | Validações vêm primeiro, com retorno antecipado. |
| R8 | **O repo trata a `IClientResponse`** do client: decide o que cada `status` significa para aquela operação (ex.: `404` vira `null` num `find`). Um `error` sem tratamento vira `InfraError` com o nome da operação e o `status`: `DatabaseError` (Supabase) ou `UpstreamResponseError` (Transicionais). **Nunca `throw new Error`**: ele fica para bug ([`errors.md`](errors.md)). |
| R10 | **Token do Transicionais:** só pela `TransicionaisSession` (`repos/transicionais/session.ts`). Login, refresh e o reenvio depois de um 401 ficam nela. Usecase e rota nunca veem token. |
| R11 | **`key` de erro do Transicionais:** o repo lê `error.details.key` e a traduz num `AppError` do Hormônios por um mapa (`TRANSICIONAIS_ERRORS`), como o `SQL_ERRORS` da R9. A mensagem do Transicionais nunca chega à tela (E2.3). Falha de rede, timeout, 429 e 5xx (`isUnavailable`, `lib/upstream.ts`) viram `UpstreamUnavailableError`. **O que fazer com a queda é regra do usecase**: o plano de falha (manter o retrato, deixar `PENDING`) é um `catch` no usecase, e não um resultado especial do repo. |
| R12 | **Repo sem regra de negócio.** Escolher entre itens (o "primeiro encontro de hoje"), decidir a partir do estado (trocar de dia, abrir/fechar), orquestrar várias chamadas (criar e desfazer) e validar entrada são do usecase. O repo oferece operações simples (`listPublicEventsFrom(date)`, `findPublicEvent(ref)`). **Exceção:** o que precisa de transação ou trava fica no repo ou na função SQL (a última vaga na `reservar`, a trava do `updated_at` no `marcar_sync`, o `skip locked` no `claim_pending`). |
| R9 | **Supabase:** `repos/supabase/repo.ts`, sem UrlCollection. Toda consulta passa por `supabaseClient.query(...)`. A função SQL sinaliza um erro de negócio com `raise exception '<CODIGO>'`, e o repo traduz o código em `AppError` por um mapa (`SQL_ERRORS`). Um código fora do mapa segue a R8. |

## Exemplo

```ts
// src/serve-utils/repos/transicionais/url-collection.ts
import type { UUID } from "../../interfaces/uuid";

export class TransicionaisUrlCollection {
  static readonly EVENT_PATH = "manager-events";

  // lido na chamada, nao no import: env ausente quebra na hora certa
  private static get apiUrl(): string {
    const url = process.env.TRANSICIONAIS_URL;

    if (!url) {
      throw new Error("TRANSICIONAIS_URL is not set");
    }

    return url;
  }

  static eventById(id: UUID): string {
    return `${this.apiUrl}/${this.EVENT_PATH}/${encodeURIComponent(id)}`;
  }
}
```

```ts
// src/serve-utils/repos/transicionais/repo.ts (trecho)
import { UpstreamUnavailableError } from "../../errors/app-error";
import { UpstreamResponseError } from "../../errors/infra-error";
import { HttpClient } from "../../clients/http-client";
import type { IEventRef, ITransicionaisRepo } from "../../interfaces/transicionais";
import { isUnavailable } from "../../lib/upstream";
import type { EventSnapshot } from "../../models/event-snapshot";
import { PublicEventResponse } from "./responses/public-event.response";
import { TransicionaisUrlCollection } from "./url-collection";

export class TransicionaisRepo implements ITransicionaisRepo {
  constructor(private readonly httpClient: HttpClient) {}

  // 404 -> null; fora do ar -> UpstreamUnavailableError; qual encontro buscar é regra do usecase
  async findPublicEvent(ref: IEventRef): Promise<EventSnapshot | null> {
    const vacanciesAt = new Date().toISOString();
    const response = await this.httpClient.get<unknown>(
      TransicionaisUrlCollection.publicEvent(ref.externalId, ref.dayId),
    );

    if (response.status === 404) { // validacoes vem primeiro, para evitar codigo horizontal
      return null;
    }

    if (isUnavailable(response.status)) {
      throw new UpstreamUnavailableError("Transicionais is unavailable");
    }

    if (response.error || response.data === undefined) {
      throw new UpstreamResponseError("publicEvent", response.status, response.error?.message);
    }

    return PublicEventResponse.toDomain(response.data, ref, vacanciesAt);
  }
}
```

O usecase decide o resto (E2.7 e plano de falha):

```ts
// src/serve-utils/usecases/refresh-current-event.ts (trecho)
private async findTransicionaisSnapshot(): Promise<EventSnapshot | null> {
  try {
    const ref = (await this.transicionaisRepo.listPublicEventsFrom(today()))[0] ?? null; // o primeiro (E2.7)

    return ref ? await this.transicionaisRepo.findPublicEvent(ref) : null;
  } catch (error) {
    if (error instanceof UpstreamUnavailableError) {
      return null; // fora do ar: fica o retrato
    }

    throw error;
  }
}
```

## Exemplo: token do Transicionais (`session.ts`)

Até existir a role `SERVICE`, o BFF entra como membro (E2.6 de `bff-fase-2.md`). O token fica na
memória da função (uma instância serve vários pedidos) e nunca sai do repo.

```ts
// src/serve-utils/repos/transicionais/session.ts
import { HttpClient, HttpMethod, type IHttpRequest } from "../../clients/http-client";
import type { IClientResponse } from "../../interfaces/client-response";
import type { IRawLogin } from "../../interfaces/transicionais";
import { TransicionaisUrlCollection } from "./url-collection";

let tokens: { access: string; refresh: string } | null = null; // memória da instância

export class TransicionaisSession {
  constructor(private readonly httpClient: HttpClient) {}

  // chamada autenticada: num 401, renova (ou entra de novo) e tenta uma vez mais
  async request<T>(input: IHttpRequest): Promise<IClientResponse<T>> {
    const first = await this.send<T>(input, await this.accessToken());

    if (first.status !== 401) {
      return first;
    }

    tokens = await this.renew();
    return this.send<T>(input, tokens.access);
  }

  private send<T>(input: IHttpRequest, access: string): Promise<IClientResponse<T>> {
    return this.httpClient.request<T>({ ...input, headers: { ...input.headers, authorization: `Bearer ${access}` } });
  }

  private async accessToken(): Promise<string> {
    tokens ??= await this.login();
    return tokens.access;
  }

  private async renew(): Promise<{ access: string; refresh: string }> {
    // tenta o refresh; se falhar, login de novo
    // ...
    return this.login();
  }

  private async login(): Promise<{ access: string; refresh: string }> {
    const username = process.env.TRANSICIONAIS_USER;
    const password = process.env.TRANSICIONAIS_PASSWORD;

    if (!username || !password) {
      throw new Error("TRANSICIONAIS_USER or TRANSICIONAIS_PASSWORD is not set");
    }

    const response = await this.httpClient.request<IRawLogin>({
      method: HttpMethod.Post,
      url: TransicionaisUrlCollection.login(),
      body: { username, password },
    });

    if (response.error || !response.data) {
      throw new Error(`Transicionais login failed with ${response.status}`);
    }

    // os nomes dos campos vêm do contrato (script da skill code-pattern)
    return { access: response.data.accessToken, refresh: response.data.refreshToken };
  }
}
```

O repo recebe a `TransicionaisSession` no construtor e chama `session.request(...)` nas rotas que
pedem token. A rota pública do encontro usa o `HttpClient` direto.

## Exemplo: Supabase (função SQL)

```ts
// src/serve-utils/repos/supabase/repo.ts (trecho)
const SQL_ERRORS: Record<string, () => AppError> = {
  BOOKING_CLOSED: () => new BookingClosedError("Booking is closed"),
  SOLD_OUT: () => new SoldOutError("Group is sold out"),
};

async reserve(data: IReserveData): Promise<Attendance> {
  const response = await this.supabaseClient.query<unknown>((sdk) =>
    sdk.rpc("reservar", ReserveRequest.fromDomain(data)).single(), // a trava da última vaga fica na função (R12)
  );

  const knownError = response.error && SQL_ERRORS[response.error.message];

  if (knownError) {
    throw knownError();
  }

  if (response.error || !response.data) {
    throw new DatabaseError("reservar", response.status, response.error?.message);
  }

  return AttendanceResponse.toDomainForUser(response.data, data.user, "reservar");
}
```
