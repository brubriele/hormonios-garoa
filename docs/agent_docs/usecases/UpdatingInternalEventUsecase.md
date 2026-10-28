# UpdatingInternalEventUsecase — `PUT /api/admin/ensaio`

> Código: [`usecases/event/UpdatingInternalEventUsecase.ts`](../../../src/bff/usecases/event/UpdatingInternalEventUsecase.ts).
> Rota: [`api/admin/ensaio.ts`](../../../api/admin/ensaio.ts) (`PUT`, com `requireAdmin`). Também é montado pelo
> [`EventWebhookUsecase`](../../../src/bff/usecases/sync/EventWebhookUsecase.ts). Índice: [`README.md`](README.md).

## Fluxo

```
api/admin/ensaio.ts PUT ── requireAdmin ── EventRequest.toDomain(body) ── execute(event)
  │
  ▼ track "updating internal event" { hormoniosEventId }
validateInput: z.instanceof(Event) + EventBodySchema (o mesmo da criação)
  ▼
findEvent: pelo id ou, sem id, pelo integrationId      null → NotFoundError
  ▼
findEventAttendance(current)
  ▼
mergeEvent(valid, current)                      null mantém o gravado
  ▼
validateAttendancesKept · validateStockAboveReservations
  ▼
hormoniosRepository.updateEvent(event)
  ▼ integrationId e sync != SYNCED?  não → segue
transicionaisRepo.updateEvent(event)            salva lá o estoque de cada item (spec-4 C1, C2)
  ├─ sucesso → metadata do Transicionais + SYNCED; fila synced
  ├─ UpstreamUnavailableError → fila pending com backoff
  └─ outro erro → fila manualRetry, com log
  ▼
findEventUsers + findEventAttendance + withAttendances(…, true)
  ▼
new ManagerEvent(counted, users) → ManagerEventResponse na rota
```

## A. Entrada e dependências

| # | Regra |
|---|---|
| A1 | Recebe o `hormoniosRepository` e o `transicionaisRepo`. |
| A2 | Entrada: um `Event` (domain) montado pela rota (`EventRequest.toDomain`) ou pelo webhook. Validado por `z.instanceof(Event)` e pelo `EventBodySchema` do `CreatingInternalEventUsecase` sobre o `toJson()`. |

## B. Passos

| # | Regra |
|---|---|
| B1 | Acha o gravado pelo `id`; sem `id`, pelo `metadata.integrationId` (`findEventByIntegrationId`). Sem os dois → `NotFoundError`. |
| B2 | `mergeEvent`: `whatsappUrl` e `bookingOpen` `null` mantêm o gravado. O `id` é sempre o gravado. |
| B3 | Grupos: `exclusiveCapacity` `null` mantém a do grupo gravado com o mesmo `id`. O admin não adiciona nem remove grupos: isso é do admin do Transicionais e chega pelo webhook (spec-4 B7). |
| B4 | Catálogo: `stock.total` e `stock.rotative` vêm da entrada; `stock.used` vem do gravado (0 se o item é novo). |
| B5 | Metadata: `externalPublicId`, `integrationId`, `transicionaisDayId`, `version`, `fetchedAt`, `syncHash` e `syncedAt` `null` mantêm o gravado. |
| B6 | Grava com `updateEvent` no Supabase. |
| B7 | Envia ao Transicionais quando o evento tem `integrationId` **e** o `sync` não é `SYNCED` (spec-4 C3). A edição do admin chega `PENDING` (`EventRequest`) e vai; a do webhook chega `SYNCED` (lida de lá) e não volta ([spec-4-duvidas](../../spec/spec-4-duvidas.md), 5). |
| B8 | O envio é o `transicionaisRepo.updateEvent`: o estoque de cada item, inclusive o zerado (`capacity: 0`), sem grupos nem publicação (spec-4 C1, C2, C5). |
| B9 | Devolve o `ManagerEvent` com as pessoas e as presenças contadas, com capacity por grupo (`withAttendances(…, true)`). |

## C. Validações, falhas e erros

| # | Regra |
|---|---|
| C1 | Grupo de uma presença que saiu do evento → `InvalidParameterError("Field groups must keep group <id>")`. |
| C2 | Item de uma presença que saiu do catálogo → `InvalidParameterError("Field catalog must keep item <id>")`. |
| C3 | Item não rotativo, com `total` não nulo, abaixo do `used` → `StockBelowReservationsError` (F4). |
| C4 | Sem evento → `NotFoundError("Event Not Found")`. |
| C5 | Falha no envio não derruba a rota (fase-2 E1): `UpstreamUnavailableError` → `pending` com backoff; outro erro → `manualRetry` com log `"event rejected by Transicionais"`. O `syncError` do evento é a `key` ou a `message` (fase-2 E3–E5). |

## D. Logs

| # | Regra |
|---|---|
| D1 | `LogContext.Event`: `track` no início e `appError` com `hormoniosEventId` no catch. |
