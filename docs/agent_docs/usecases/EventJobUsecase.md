# EventJobUsecase — `GET /api/cron/sync?type=event`

> Código: [`usecases/job/EventJobUsecase.ts`](../../../src/serve-utils/usecases/job/EventJobUsecase.ts).
> Chamado pelo [`JobUsecase`](../../../src/serve-utils/usecases/job/JobUsecase.ts) (rota
> [`api/cron/sync.ts`](../../../api/cron/sync.ts)). Índice: [`README.md`](README.md).

## Fluxo

```
JobUsecase (type=event) ── execute(job)
  ▼ track "event job started"
findDueIntegrationStatus(Event, PENDING, now, MAX_ITEMS_PER_JOB)
  ▼ Promise.all, um try/catch por item
findEvent(entityId)
  ├─ null → manualRetry("Event not found"), sai da resposta
  ├─ integrationId != null → transicionaisRepo.updateEvent(event)   (spec-4 C4)
  ├─ sem date → pending("Event date is not defined")
  └─ transicionaisRepo.createEvent(event)
        ├─ ok → saveSynced: metadata do Transicionais + SYNCED; fila synced
        └─ erro → toFailedStatus → saveFailure
  ▼
track "event job item" por item; track "event job finished" (resumo)
lista dos eventos processados (sem os null)
```

## A. Entrada e dependências

| # | Regra |
|---|---|
| A1 | Recebe o `transicionaisRepo` e o `hormoniosRepository`. Sem `token`: quem monta é o `JobUsecase` (U12). |
| A2 | Entrada: `Job` (domain), validado por `z.instanceof(Job)`. |

## B. Passos

| # | Regra |
|---|---|
| B1 | Pede ao repo os `EVENT` `PENDING` vencidos da fila (`findDueIntegrationStatus`), até `MAX_ITEMS_PER_JOB` (30) (fase-2 J3). |
| B2 | Itens em paralelo (`Promise.all`), cada um com o seu `try/catch`: erro inesperado vai para o log e o item sai da resposta (fase-2 J4). |
| B3 | Evento que não existe mais → `manualRetry` com `ErrorCtx(0, null, null, "Event not found")`; sai da resposta (fase-2 J5). |
| B4 | Evento com `integrationId` → reenvia a edição pelo `transicionaisRepo.updateEvent` (o estoque de cada item), com o mesmo plano de falha (spec-4 C4; substitui a fase-2 J6, que só marcava `SYNCED`). |
| B5 | Sem `date` → `pending` com `"Event date is not defined"` (fase-2 E6). |
| B6 | Senão, `createEvent`: cria o encontro lá, com o nome `<nome>#<id>` e a publicação com todos os grupos (spec-4 F1, B9). Sucesso: o metadata do evento passa a ser o que o Transicionais devolveu, com `sync: SYNCED` e `syncError: null`; grava a fila (`synced`) e o evento (`updateEvent`). |

## C. Falhas

| # | Regra |
|---|---|
| C1 | `UpstreamUnavailableError` → `pending`: `tentatives + 1` e `nextSyncAt` daqui a 1, 5, 15 e depois 60 min; na 10ª (`MAX_INTEGRATION_TENTATIVES`), `MANUAL_RETRY` (fase-2 E3). |
| C2 | Outro erro → `manualRetry` com log `"event rejected by Transicionais"` (fase-2 E4). |
| C3 | O `errorCtx` vem de `toErrorCtx` (o corpo do Transicionais como veio, D50). O `syncError` do evento é a `key` ou, sem ela, a `message` (fase-2 E5). |

## D. Logs e saída

| # | Regra |
|---|---|
| D1 | `LogContext.Job`: `track` no início, `appError` no catch e `error` por item com `hormoniosEventId`. Também `track("event job item", { hormoniosEventId, status })` por item e `track("event job finished", jobSummary(...))` no fim (spec-6 A7). |
| D2 | Devolve os `Event` processados, com o `metadata` (`sync` e `syncError` mostram o resultado, fase-2 J7). |
