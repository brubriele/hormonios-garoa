# Rotas (`api/`)

> Índice: [`README.md`](README.md). Usa: [`usecases.md`](usecases.md), [`errors.md`](errors.md).

## Regras

| # | Regra |
|---|---|
| A1 | A rota **não tem regra de negócio**. Ela lê a entrada, monta o usecase, chama `execute` e responde. |
| A2 | As dependências (client, repos) são montadas na rota e passadas ao usecase pelo construtor. |
| A3 | `AppError` vira resposta com o `status` e a `key` do erro. Qualquer outro erro vira `500` genérico. |
| A4 | As rotas ficam numa lista fechada (spec da fase 1). Rota nova entra na spec antes do código. |

## Exemplo

```ts
// api/events/[id].ts
import { AppError } from "../../src/serve-utils/errors/app-error";
import { HttpClient } from "../../src/serve-utils/clients/http-client";
import { TransicionaisRepo } from "../../src/serve-utils/repos/transicionais/repo";
import { FindEventUsecase } from "../../src/serve-utils/usecases/find-event";
import type { UUID } from "../../src/serve-utils/interfaces/uuid";

export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).pathname.split("/").pop() as UUID;

  const usecase = new FindEventUsecase(new TransicionaisRepo(new HttpClient()));

  try {
    const event = await usecase.execute({ id });

    return Response.json(event);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ key: error.key, message: error.message }, { status: error.status });
    }

    return Response.json({ key: "INTERNAL_ERROR" }, { status: 500 });
  }
}
```
