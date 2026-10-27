# Produção

> Atualizado em 2026-10-26 (refactor do domain, [`create-domain.md`](../../../plans/create-domain.md)).
> O login (`POST /api/admin/entrar`) não tem usecase. As rotas da Produção têm `requireAdmin` na
> primeira linha.

## FindingInternalEventUsecase — `GET /api/admin/ensaio`

> [`usecases/event/FindingInternalEventUsecase.ts`](../../../../src/serve-utils/usecases/event/FindingInternalEventUsecase.ts)

**Contexto.** A Produção vê o ensaio atual com as pessoas e as presenças. Substitui o antigo
`GET /api/admin/resumo` (D14).

**Decisão.**
- Acha o evento atual (D2). Sem evento (base vazia, primeira vez que o projeto roda), cria o
  primeiro pelo `createMockEvent()`: o `emptyState()`
  ([`repos/supabase/mock/emptyState.ts`](../../../../src/serve-utils/repos/supabase/mock/emptyState.ts),
  a linha de `emptyState.json` lida pelo `EventResponse`) passa pelo `CreatingInternalEventUsecase`,
  que gera um `id` novo e grava. Se a criação falhar, loga e responde `NotFoundError`.
- Lê as presenças e as pessoas do evento (`findEventUsers`, D5, D16).
- Devolve um `ManagerEvent`: o `Event` com `withAttendances(attendances, true)` (com o `capacity`
  dos grupos) e as `users` com as presenças delas.

**Consequências.**
- A presença não repete o evento no JSON: liga pelo `eventId` (D5).

## CreatingInternalEventUsecase — `POST /api/admin/novo-ensaio`

> [`usecases/event/CreatingInternalEventUsecase.ts`](../../../../src/serve-utils/usecases/event/CreatingInternalEventUsecase.ts)

**Contexto.** Cria um evento na base. Quem chama: a Produção (novo ensaio) e o
`EventWebhookUsecase`, quando o evento do Transicionais ainda não existe aqui.

**Decisão.**
- **Recebe um `Event`.** Quem chama monta o domain: a rota pelo
  [`api/admin/_requests/EventRequest.ts`](../../../../api/admin/_requests/EventRequest.ts)
  (`stock.used` 0, metadata de integração `null`, `sync: PENDING`); o webhook pelo `Event` que o
  repo do Transicionais devolve.
- Valida que é um `Event` e o `toJson()` dele pelo `EventBodySchema`: local não vazio, data
  `YYYY-MM-DD` ou vazia, horário `HH:mm`, `catalog.metadata.groupIds` só com grupos do evento e no
  máximo um `INSTRUMENT` por grupo.
- Gera o `id` (`crypto.randomUUID()`): o `Event` chega sem ele.
- Grava com `createEvent`. O evento criado vira o atual (D2). A rota responde 201.
- Envia quando o `integrationId` é `null` e o `sync` não é `SYNCED` nem `MANUAL_RETRY` (o webhook e
  o `emptyState` já trazem o `integrationId`): `createEvent` no Transicionais (encontro, ciclo,
  grupos, `public`, dia e o catálogo de cada assistência) e grava o metadata do `Event` devolvido,
  com `SYNCED`. Evento sem data (`date` vazia) → `PENDING` com backoff.
- **Envio ao Transicionais** ([`sincronizacao.md`](sincronizacao.md), "Envio"): depois de gravar, o
  `private sync` tenta enviar. O resultado vai no metadata e na fila `integration_status`, e a
  resposta da rota não muda.

**Consequências.**
- O usecase grava o metadata como veio: para a Produção, `PENDING` e sem integração; para o
  webhook, `SYNCED` com `integrationId`, `version`, `syncHash` e `syncedAt` do Transicionais.
- Corpo da Produção sem os campos que o `EventRequest` lê quebra antes da validação (500, não 400).

## UpdatingInternalEventUsecase — `PUT /api/admin/ensaio`

> [`usecases/event/UpdatingInternalEventUsecase.ts`](../../../../src/serve-utils/usecases/event/UpdatingInternalEventUsecase.ts)

**Contexto.** Edita um evento da base (D13). Quem chama: a Produção e o `EventWebhookUsecase`,
quando o evento do Transicionais já existe aqui e mudou.

**Decisão.**
- **Recebe um `Event`**, validado como no create (`EventBodySchema` sobre o `toJson()`).
- Acha o evento gravado pelo `id` (Produção) ou, sem `id`, pelo `metadata.integrationId`
  (webhook). Não achou → `NotFoundError`. Não exige que seja o atual.
- O corpo do `PUT` vem no formato da resposta (sem `metadata`): o `EventRequest` monta o `Event`
  com o `exclusiveCapacity` dos grupos `null`, que no de-para fica o gravado.
- Faz o de-para do `Event` recebido com o gravado. O metadata é o dado do Transicionais que o
  Hormônios também usa; a raiz tem o que o Transicionais desconhece (ex.: `whatsappUrl` e `bookingOpen`). Campo
  `null` é "não enviou" e fica o gravado; vazio é alteração e é aplicado. O `id` é sempre o do
  gravado, e o `stock.used` de cada item também (0 para item novo).
- Recusa tirar um grupo ou um item do catálogo que alguma presença do evento usa
  (`InvalidParameterError`) e um `total` abaixo das presenças `vou` do item, menos rotativo
  (`StockBelowReservationsError`, F4).
- Grava com `updateEvent` e devolve o `ManagerEvent` atualizado.

**Consequências.**
- O webhook não mexe no `whatsappUrl` nem no `bookingOpen`: o `Event` do Transicionais vem com os
  dois `null`. A Produção apaga o link mandando vazio. Evento criado pelo webhook fica com os dois
  `null` (reserva fechada) até a Produção definir.
- As regras do `EventBodySchema` também valem para o evento do Transicionais: local em branco ou
  dois instrumentos no mesmo grupo fazem o webhook responder 400.
