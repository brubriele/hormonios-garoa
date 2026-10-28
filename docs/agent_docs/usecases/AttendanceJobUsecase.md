# AttendanceJobUsecase — `GET /api/cron/sync?type=attendance`

> Código: [`usecases/job/AttendanceJobUsecase.ts`](../../../src/serve-utils/usecases/job/AttendanceJobUsecase.ts).
> Chamado pelo [`JobUsecase`](../../../src/serve-utils/usecases/job/JobUsecase.ts) (rota
> [`api/cron/sync.ts`](../../../api/cron/sync.ts)). Índice: [`README.md`](README.md).

## Fluxo

```
JobUsecase (type=attendance) ── execute(job)
  ▼ track "attendance job started"
findDueIntegrationStatus(Attendance, PENDING, now, MAX_ITEMS_PER_JOB)
  ▼ Promise.all, um try/catch por item
findEventByAttendanceId → findAttendance(id, event) → findUser(attendance.metadata.userId)
  ├─ falta um → manualRetry("Attendance, user or event not found"), sai da resposta
  ├─ sem account ou sem transicionaisDayId → pending("User or event is not integrated")
  └─ transicionaisRepo.createAttendance(user com [attendance])
        ├─ ok → findPresence → syncHash + integrationId → SYNCED (presença e fila)
        └─ erro → PENDING (fora do ar) / MANUAL_RETRY
  ▼
track "attendance job item" por item; track "attendance job finished" (resumo)
lista das presenças processadas (sem os null)
```

## A. Entrada e dependências

| # | Regra |
|---|---|
| A1 | Recebe o `transicionaisRepo` e o `hormoniosRepository`. Sem `token`: quem monta é o `JobUsecase` (U12). |
| A2 | Entrada: `Job` (domain), validado por `z.instanceof(Job)`. |

## B. Passos

| # | Regra |
|---|---|
| B1 | Lê da fila as `ATTENDANCE` `PENDING` vencidas, até `MAX_ITEMS_PER_JOB` (30), em paralelo, cada uma com o seu `try/catch` (fase-2 J3, J4). |
| B2 | Acha o evento pela presença (`findEventByAttendanceId`), a presença e a pessoa. Sem um deles → `manualRetry("Attendance, user or event not found")` (fase-2 J5). |
| B3 | Não confere o `sync` da presença: tudo que está `PENDING` na fila é enviado. |
| B4 | Envia e grava como o [`CreatingOrUpdatingAttendanceUsecase`](CreatingOrUpdatingAttendanceUsecase.md) B4–B8, inclusive a leitura da presença depois do envio, sem as validações da reserva (já passaram) (spec-4 D3). |

## C. Falhas, logs e saída

| # | Regra |
|---|---|
| C1 | Como o [`CreatingOrUpdatingAttendanceUsecase`](CreatingOrUpdatingAttendanceUsecase.md) D1. |
| C2 | `LogContext.Job`: `track`, `appError` no catch e `error` por item com `hormoniosAttendanceId`. Também `track("attendance job item", { hormoniosAttendanceId, status })` por item e `track("attendance job finished", jobSummary(...))` no fim (spec-6 A7). |
| C3 | Devolve as `Attendance` processadas, com o `metadata` (fase-2 J7). |

