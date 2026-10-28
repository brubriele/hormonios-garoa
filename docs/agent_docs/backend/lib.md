# Lib (`src/bff/lib/`)

> Índice: [`README.md`](README.md).

O que é comum a mais de uma camada **e não depende de lib externa**. Antes de escrever um helper,
procure aqui: helper repetido em dois arquivos é erro de revisão.

## Regras

| # | Regra |
|---|---|
| L1 | Um arquivo por assunto (`date.ts`, `upstream.ts`, `logger.ts`), com funções exportadas e sem estado. |
| L2 | Nada de lib externa (zod, supabase-js). O helper que usa o zod fica junto de quem o usa (ex.: `repos/parse-response.ts`, `lib/schema.ts`). |
| L3 | Não existe pasta de validações. A validação é do zod, no schema de quem a usa ([`requests-responses.md`](requests-responses.md)). |
| L4 | **Log só pelo logger:** `const logger = createLogger("<Escopo>", LogContext.<Contexto>)` no topo do arquivo. Nada de `console.*` fora de `lib/logger.ts`. |
| L5 | `logger.error({ err }, msg)` para falha que não é `AppError`; o erro vai sempre no campo `err`. `warn` fica só no `handle`, que registra a `key` de toda resposta de erro. |
| L6 | Os dados variáveis vão nos campos, não na mensagem: `logger.warn({ supportId }, "instrument support has no group of the event (D21)")`, e não `` `support ${id} has no group` ``. A mensagem é fixa e cita a decisão (D#, E#) quando houver. |
| L7 | **Contexto:** `LogContext.Event`, `User`, `Attendance`, `Job` ou `Sync` nos usecases (o domínio do usecase; `sync/` é `Sync`, `job/` é `Job`); `HormoniosRepository` ou `TransicionaisRepository` nos repos. Quem não é usecase nem repo (ex.: `handle`) fica sem contexto. |
| L8 | **Log é para erro.** Cada `AppError` é logado uma vez, no catch do `execute` do usecase: `logger.appError(error, { hormoniosEventId \| hormoniosUserId \| hormoniosAttendanceId })`, com o id do Hormônios que a entrada traz. O repo loga a falha da fonte antes de lançar: `logger.repositoryError(error, operation)`. |
| L9 | **Tracking só estratégico:** `logger.track("<o que o usecase faz>", ids?)` na primeira linha do `_execute`. Nada de `info`/`warn` espalhado pelo fluxo, nem log quebrado em várias linhas: cada log cabe numa linha. **Exceção, os jobs** (`usecases/job/`): também um `track("<tipo> job item", { hormonios*Id, status })` por item e um `track("<tipo> job finished", jobSummary(...))` no fim do `_execute` (spec-6 A7). |
| L10 | `jobSummary(found, statuses)` (`job-summary.ts`) monta o resumo do job: `found`, `synced`, `pending`, `manualRetry`, `rejected` (dos itens que voltaram) e `notSent` (não achados, que ficam `MANUAL_RETRY`, ou falha inesperada, que já tem log de erro). |

## O que existe

| Arquivo | Exporta |
|---|---|
| `date.ts` | `SAO_PAULO_TIME_ZONE`, `today(timeZone?)` (YYYY-MM-DD), `addDays(date, days)` |
| `upstream.ts` | `isUnavailable(status)`: 0, 429 ou 5xx = fora do ar |
| `job-summary.ts` | `jobSummary(found, statuses)`: o resumo do job para o `track` do fim (L10) |
| `logger.ts` | `createLogger(scope, context?)`, `LogContext`, `ILogIds`, `Logger` (abstrata, API do pino: `debug/info/warn/error(campos?, msg)`, `child`, e os atalhos `appError`, `repositoryError` e `track(msg, campos?)`), `LogLevel` |

## Logger

Uma linha JSON por registro, com `level`, `time`, `context`, `scope`, os campos e `msg`. O `err` sai com
`name`, `message`, `stack` e, num `InfraError`, `key` e `source`. Para trocar pelo pino, basta escrever
outra implementação de `Logger`.

```ts
import { createLogger, LogContext } from "../../lib/logger";

const logger = createLogger("UpdatingInternalEventUsecase", LogContext.Event);

logger.track("updating internal event", { hormoniosEventId: data.id }); // primeira linha do _execute
logger.appError(error, { hormoniosEventId: data.id });                // no catch do execute, antes do throw
logger.error({ err: error }, "unexpected error");                     // erro que não é AppError
```

```ts
// repo: loga e devolve o erro, numa linha
private databaseError(operation: string, status: number, message?: string): DatabaseError {
  const error = new DatabaseError(operation, status, message);

  logger.repositoryError(error, operation);

  return error;
}
```

```json
{"level":"error","time":"…","context":"Event","scope":"UpdatingInternalEventUsecase","hormoniosEventId":"f2c8…","err":{…},"key":"NOT_FOUND_ERROR","msg":"app error"}
```
