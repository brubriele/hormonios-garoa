# Rotas (`api/`)

> Índice: [`README.md`](README.md). Usa: [`http.md`](http.md), [`usecases.md`](usecases.md), [`errors.md`](errors.md).

## Regras

| # | Regra |
|---|---|
| A1 | A rota **não tem regra de negócio**. Ela lê a entrada, monta o usecase, chama `execute` e responde. |
| A2 | As dependências (client, repos) são montadas na rota e passadas ao usecase pelo construtor. |
| A3 | Toda rota é envolvida por `handle(...)` ([`http.md`](http.md)), que converte `AppError` em `status` + `key` e qualquer outro erro em `500`. A rota não tem `try/catch`. |
| A4 | As rotas ficam numa lista fechada (plano da fase). Rota nova entra no plano antes do código. |
| A5 | Cookies e sessão só pelas peças de `http/` (`getOrCreateDevice`, `requireAdmin`, `createAdminCookie`, `isAdminKey`). Nas rotas da Produção, `requireAdmin` é a primeira linha. |
| A6 | Nas rotas `api/cron/*`, `requireCron(request)` é a primeira linha. Na rota de webhook, `verifyWebhookJwt(request)` é a primeira linha ([`http.md`](http.md), H9 e H10). |
| A7 | A rota **não valida a entrada**: repassa o corpo, o `deviceId` e o `ip` ao usecase, que valida tudo pelo schema zod dele ([`usecases.md`](usecases.md), U10). |

## Exemplo

```ts
// api/events/[id].ts
import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { handle } from "../../src/serve-utils/http/handle";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { FindingEventUsecase } from "../../src/serve-utils/usecases/event/finding-event";
import type { UUID } from "../../src/serve-utils/interfaces/uuid";

export const GET = handle(async (request) => {
  const id = new URL(request.url).pathname.split("/").pop() as UUID;

  const usecase = new FindingEventUsecase(new TransicionaisRepo(new HttpClient()));

  return { body: await usecase.execute({ id }) };
});
```

## Exemplo: aparelho e Produção

```ts
// api/admin/entrar.ts
import { UnauthorizedError } from "../../src/serve-utils/errors/app-error";
import { createAdminCookie, isAdminKey } from "../../src/serve-utils/http/admin-session";
import { handle, readJson } from "../../src/serve-utils/http/handle";

export const POST = handle(async (request) => {
  const { key } = await readJson<{ key?: string }>(request);

  if (!key || !(await isAdminKey(key))) {
    throw new UnauthorizedError("Invalid admin key");
  }

  return { cookies: [await createAdminCookie()] };
});
```

```ts
// api/minhas-reservas.ts (trecho)
export const GET = handle(async (request) => {
  const { deviceId, cookie } = getOrCreateDevice(request);
  const body = await new FindingUserBookingsUsecase(repo).execute({ deviceId });

  return { body, cookies: cookie ? [cookie] : [] };
});
```
