# FindingPublicEventUsecase — `GET /api/ensaio`

> Código: [`usecases/event/FindingPublicEventUsecase.ts`](../../../src/serve-utils/usecases/event/FindingPublicEventUsecase.ts).
> Rota: [`api/ensaio.ts`](../../../api/ensaio.ts). Índice: [`README.md`](README.md).

## Fluxo

```
api/ensaio.ts ── Envolviment.make(token) ── execute()          (sem entrada)
  │
  ▼ track "finding public event"
hormoniosRepository.findCurrentEvent()        o último criado (fase-1 D2)
  │ null
  ├─► transicionaisRepo.findLastPublicEvent()  o último Público do Transicionais (spec-4 A2)
  │     │ UpstreamUnavailableError ou NotFoundError → NotFoundError("Event Not Found")
  │     ▼
  │   hormoniosRepository.createEvent(uuid novo, bookingOpen false, whatsappUrl null)   (fase-2 W5)
  ▼
hormoniosRepository.findEventAttendance(event)   as presenças do evento
  ▼
event.withAttendances(attendances, false)     conta vou e não REJECTED; sem capacity
  ▼
EventResponse.fromDomain(event) na rota
```

## A. Entrada e dependências

| # | Regra |
|---|---|
| A1 | Recebe o `hormoniosRepository` e o `transicionaisRepo`. O `case` do `Envolviment` monta o repo do Transicionais e guarda o usecase no cache por estado (spec-3 B3). |
| A2 | Sem entrada: `execute()` não recebe nada, então não tem `validateInput`. Tem `token` para o `Envolviment` (U12). |

## B. Passos

| # | Regra |
|---|---|
| B1 | O ensaio atual vem do `findCurrentEvent` do repo: o último criado (fase-1 D2). |
| B2 | Sem ensaio no Supabase, busca o último Público no Transicionais (`findLastPublicEvent`, spec-4 A2) e grava aqui com `createEvent` do repo: uuid novo, `bookingOpen: false`, `whatsappUrl: null` e o metadata do Transicionais (`SYNCED`) (spec-4 A3). Não passa pelo `EventBodySchema`, para um encontro de lá fora desse formato não virar 400. |
| B3 | As presenças vêm do `findEventAttendance(event)` do repo. |
| B4 | `withAttendances(attendances, false)` conta só `answer = vou` com `sync` diferente de `REJECTED`. Preenche o `stock.used` de cada item e o `goingCount`. O `false` não calcula a vaga por grupo (o público não vê, fase-1). |

## C. Erros

| # | Regra |
|---|---|
| C1 | Sem ensaio aqui e no Transicionais, ou com o Transicionais fora do ar → `NotFoundError("Event Not Found")` (404). |
| C2 | Falha do Supabase → `InfraError` do repo, que vai para o log e sai como erro genérico (U5). |
| C3 | Sem trava: dois `GET /api/ensaio` ao mesmo tempo, com o Supabase vazio, podem gravar dois eventos ([spec-4-duvidas](../../spec/spec-4-duvidas.md), 6). |

## D. Logs e saída

| # | Regra |
|---|---|
| D1 | `LogContext.Event`: `track` no início e `appError` no catch, sem `hormoniosEventId` (não há entrada). |
| D2 | Devolve o `Event` (domain), e a rota formata pelo `EventResponse`, que inclui o `integrationId` e o `externalPublicId` (spec-4 F3). |
