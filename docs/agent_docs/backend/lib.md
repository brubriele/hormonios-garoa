# Lib (`src/serve-utils/lib/`)

> Índice: [`README.md`](README.md).

O que é comum a mais de uma camada **e não depende de lib externa**. Antes de escrever um helper,
procure aqui: helper repetido em dois arquivos é erro de revisão.

## Regras

| # | Regra |
|---|---|
| L1 | Um arquivo por assunto (`date.ts`, `upstream.ts`, `logger.ts`), com funções exportadas e sem estado. |
| L2 | Nada de lib externa (zod, supabase-js). O helper que usa o zod fica junto de quem o usa (ex.: `repos/parse-response.ts`). |
| L3 | Não existe pasta de validações. A validação é do zod, no schema de quem a usa ([`requests-responses.md`](requests-responses.md)). |
| L4 | **Log só pelo logger:** `const logger = createLogger("<Escopo>")` no topo do arquivo. Nada de `console.*` fora de `lib/logger.ts`. |
| L5 | `logger.warn(campos, msg)` para dado ignorado ou situação esperada (instrumento sem grupo, encontro não achado). `logger.error({ err }, msg)` para falha. O erro vai sempre no campo `err`. |
| L6 | Os dados variáveis vão nos campos, não na mensagem: `logger.warn({ supportId }, "instrument support has no group of the event (D21)")`, e não `` `support ${id} has no group` ``. A mensagem é fixa e cita a decisão (D#, E#) quando houver. |

## O que existe

| Arquivo | Exporta |
|---|---|
| `date.ts` | `SAO_PAULO_TIME_ZONE`, `today(timeZone?)` (YYYY-MM-DD), `addDays(date, days)` |
| `upstream.ts` | `isUnavailable(status)`: 0, 429 ou 5xx = fora do ar |
| `logger.ts` | `createLogger(scope)`, `Logger` (abstrata, API do pino: `debug/info/warn/error(campos?, msg)`, `child`), `LogLevel` |

## Logger

Uma linha JSON por registro, com `level`, `time`, `scope`, os campos e `msg`. O `err` sai com
`name`, `message`, `stack` e, num `InfraError`, `key` e `source`. Para trocar pelo pino, basta escrever
outra implementação de `Logger`.

```ts
import { createLogger } from "../lib/logger";

const logger = createLogger("RefreshCurrentEventUsecase");

logger.warn({ externalId: ref.externalId, dayId: ref.dayId }, "public Transicionais event not found");
logger.error({ err: error }, "unexpected error");
```

```json
{"level":"warn","time":"…","scope":"PublicEventResponse","supportId":"213","msg":"instrument support has no group of the event (D21)"}
```
