# Back — Fase 2: integração com o Transicionais e plano de falha

> O que está implementado em `api/`, `src/serve-utils/` e nas migrations `0002_fase2.sql`,
> `0003_estoque_supports.sql`, `0004_sync.sql` até `0011_renomeacao.sql`. Só o que mudou desde a [fase 1](fase-1.md).
> Plano: [`bff-fase-2.md`](../../plans/bff-fase-2.md) e
> [`bff-fase-2-implementacao.md`](../../plans/bff-fase-2-implementacao.md). Front: [`../front/fase-2.md`](../front/fase-2.md).
> Dúvidas em aberto: [`bff-fase-2-duvidas.md`](../../plans/bff-fase-2-duvidas.md) (citadas como D#).
> Usecases (um doc por domínio): [`usecases/`](usecases/README.md).

## Visão geral

- O ensaio, os instrumentos, os acessórios e o estoque vêm do Transicionais. O Supabase guarda um
  **retrato** dele em `hg_current_event` (cache).
- O encontro atual é o do retrato enquanto ele estiver na listagem de manager (Públicos de hoje em
  diante); senão, o **primeiro encontro Público** dela (E2.7). Não há env com o encontro.
- O **estoque** é o `capacity` das assistências do Transicionais, não a vaga do grupo (E2.9). O
  instrumento é a assistência `type='instrumento'`; os acessórios são as `type='acessorio'`.
- O BFF entra no Transicionais como **membro** (`POST auth/login`), até existir a role `SERVICE` (E2.6).
- A reserva é gravada **primeiro no Supabase** (`PENDING`) e depois enviada ao Transicionais como
  convidado (E2.8). Se ele estiver fora, o cron envia depois.
- A Produção mantém a mesma tela. O BFF repassa as edições ao Transicionais (E2.5). O link do
  WhatsApp continua só do Hormônios.
- Para quem reserva, o Transicionais é invisível (E2.3): os erros dele viram `key` do Hormônios.

## Envs novas

| Env | Uso |
|---|---|
| `TRANSICIONAIS_URL` | base da API, **com** o prefixo `/apps_nodejs` |
| `TRANSICIONAIS_USER`, `TRANSICIONAIS_PASSWORD` | login do membro ADMIN do BFF (E2.6) |
| `TRANSICIONAIS_ORG_ID` | `customId` da organização, na rota pública do encontro (D14) |
| `CRON_SECRET` | `Authorization: Bearer` das rotas `/api/cron/*` |
| `TRANSICIONAIS_JWT_KEY` | chave HS256 que confere o JWT dos webhooks |

Como na fase 1, a env é lida na chamada. Ausente: 500 `INTERNAL_ERROR`. As envs da fase 1 continuam.

## Modelo

### Colunas novas (`0002_fase2.sql`)

| Tabela | Colunas novas | Observação |
|---|---|---|
| `hg_current_event` | `external_id` text, `version` int, `vacancies_at` timestamptz, `fetched_at` timestamptz | `external_id` null = retrato local da fase 1. É o `public.id` do encontro (D6). |
| `hg_users` | `transicionais_guest_id` text **unique** | devolvido pelo envio da reserva |
| `hg_attendances` | `transicionais_sync` (`PENDING` \| `SYNCED` \| `REJECTED`, padrão `PENDING`), `transicionais_order_id` text **unique**, `transicionais_changed_at`, `sync_error`, `attempts` (0), `next_attempt_at` (now) | índice em `(transicionais_sync, next_attempt_at)` |
| `hg_webhook_deliveries` (nova) | `delivery_id` text **pk**, `type`, `received_at` | deduplicação dos webhooks. RLS ligada, sem política. |
| `hg_pending_syncs` (nova, `0009`; era `hg_pending_writes` até a `0011`) | `id` uuid **pk**, `kind` (`STOCK_UPDATE` \| `EVENT_CREATION`), `target` (supportId ou `'event'`), `data` jsonb, `status` (`PENDING` \| `SYNCED` \| `REJECTED` \| `MANUAL_RETRY`), `sync_error`, `error_cause`, `attempts`, `next_attempt_at`, `updated_at` | a fila da Produção com o Transicionais fora (D51–D53). Uma `PENDING` por `(kind, target)`. RLS ligada, sem política. |

`hg_attendances.updated_at` marca a **última mudança local**. Só `reservar`, o "Não vou" e
`migrar_fase1` mexem nele. Ele é a trava do envio e entra na chave de idempotência.

### jsonb de `hg_current_event.data` (E2.9, `0003`; chaves renomeadas na `0011`)

```
{ dayKey, date, time, location, bookingOpen, whatsappUrl,
  instruments: [{ id, name, stockTotal, active, taken, rotativo, instrumentSupportId }],
  accessories: [{ id, name, stockTotal, taken, rotativo, groupIds }] }
```

| Campo | Do Transicionais |
|---|---|
| `instruments[]` | um por assistência `type='instrumento'`. `id` = o primeiro grupo do encontro em `groupIds` dela (D21, D25). `name` = título da assistência. |
| `instruments[].instrumentSupportId` | id da assistência do instrumento. Interno ao BFF: não sai nas respostas de `/api`. |
| `accessories[]` | assistências `type='acessorio'`. `groupIds` vazio = vale para todos os grupos. |
| `stockTotal` | `capacity` da assistência. `null` = sem limite (D20). |
| `taken` | `confirmed` de `configDays[].summary.supports` do dia: quem disse "vou" pedindo a assistência (D47; antes `occupied`, D19). Só no retrato do Transicionais. |
| `rotativo` | `rotativo` da assistência: pode passar da capacidade. |

- Assistência inativa ou com `type` desconhecido fica fora (D24).
- Todo instrumento do retrato é `active: true` (D8).
- O retrato local da fase 1 não tem os campos novos. Lido assim: sem `taken`, sem limite nos
  acessórios, não rotativo e `groupIds` vazio.
- `dayKey` = `String(configDayId)` do dia atual.

## Funções SQL

Todas `security definer`, com `execute` só para `service_role`.

| Função | Migration | O que faz |
|---|---|---|
| `gravar_retrato(p_external_id, p_version, p_hash, p_vacancies_at, p_data)` → boolean | 0002, revista na 0007 (D48) | Grava o retrato com trava. Troca a linha se o `external_id` é outro, ou se o `hash` do Transicionais mudou e a leitura é mais nova (`p_vacancies_at`). Sem `hash` (retrato do webhook): a regra antiga, pela version. Sem mudança, só marca `fetched_at`. O `whatsappUrl` gravado fica. |
| `gravar_whatsapp(p_url)` | 0002 | Grava só o `whatsappUrl` no `data`, sem disputar com o retrato. |
| `migrar_fase1(p_old_day_key, p_new_day_key, p_group_map)` → int | 0002 | Leva as linhas de um dia para outro, marca `PENDING`, zera `attempts` e muda o `updated_at`. Grupo fora do mapa vira só presença. Quem já tem linha no dia novo fica com ela. Usada na primeira leitura do Transicionais (mapa vazio, E2.2 e D15) e na troca de data (mapa identidade, D7). |
| `reservar(...)` | 0003, revista na 0008 e na 0011 | A da fase 1 com estoque por assistência. Ver abaixo. |
| `claim_pending(p_limit)` → linhas | 0005 (antes 0004) | Pega até N linhas `PENDING` com `next_attempt_at` vencido (`for update skip locked`) e adia o `next_attempt_at` em 2 min. Todos os dias do Transicionais (`day_key` numérico); os de ensaio antigo da fase 1 (UUID) ficam de fora (D45, revê a D11). |
| `marcar_sync(p_id, p_updated_at, p_mode, …)` → boolean | 0004, revista na 0006 (D46) | Grava o resultado do envio só se a linha ainda tem o `updated_at` lido **e** está `PENDING`. Modos na tabela do envio. `false` = a linha mudou (continua `PENDING`). |
| `aplicar_validacao(p_order_id, p_day_key, p_guest_id, p_email, p_data, p_changed_at)` → text | 0004 | Webhook `validation.changed`. Devolve `APPLIED`, `STALE`, `LOCAL_NEWER`, `UNKNOWN_PERSON` ou `NO_ROW`. |
| `gravar_vagas(p_day_key, p_vacancies_at, p_taken)` → boolean | 0004, revista na 0011 | Troca o `taken` de `instruments` e `accessories` (`p_taken: { instruments, accessories }`) pelo ocupado do webhook. Só no retrato do Transicionais, no mesmo dia e com `p_vacancies_at` mais novo que `vacancies_at`. |
| `estoque_pendente(p_support_id, p_capacity, p_data)` | 0009, revista na 0011 | Enfileira o `STOCK_UPDATE` (troca a `PENDING` da mesma assistência) e grava o retrato com o estoque novo (`p_data`, montado pelo usecase), com a trava da linha do retrato (D53). |
| `encerrar_local(p_data, p_sync)` | 0009, revista na 0011 | "Encerrar" com o Transicionais fora: troca o retrato pelo próximo local (`external_id`, `version` e `hash` null) e enfileira o `EVENT_CREATION`. Já há um aberto (`PENDING` ou `MANUAL_RETRY`): `EVENT_CREATION_PENDING` → `EVENT_CREATION_PENDING_ERROR` (D51). |
| `claim_syncs(p_kind, p_limit)` → linhas | 0009, revista na 0010; era `claim_escritas` até a 0011 | Como o `claim_pending`, na fila da Produção, só do tipo pedido (cada contexto do cron pega o seu). |
| `marcar_sync_pendente(p_id, p_updated_at, p_mode, p_error, p_error_cause)` → boolean | 0009; era `marcar_escrita` até a 0011 | Como o `marcar_sync`: `SYNCED`, `REJECTED` (no estoque, zera o `hash` do retrato para o refresh regravar o valor de lá, D52), `MANUAL_RETRY` ou `BACKOFF` (1, 2, 4… até 30 min). |

Nenhuma função da 0004 mexe em `updated_at` (D39). A `trocar_encontro`, citada na D10, não existe
nas migrations: o encontro novo entra pelo `gravar_retrato` (outro `external_id`).

### `reservar` (0003)

Os passos 1 a 4 e o último são os da fase 1. Mudam:

| Passo | O que faz | Erro |
|---|---|---|
| supports | cada `supportId` existe no retrato e vale para o grupo (`groupIds` vazio ou com o grupo). Com `supportIds` e sem grupo também dá erro. | `INVALID_SUPPORT` → `INVALID_PARAMETER_ERROR` |
| já reservado | linha `vou` que está `REJECTED` vale como `nao-vou` | `ALREADY_RESERVED` |
| instrumento | rotativo ou `stockTotal` null não bloqueia. Ocupado ≥ `stockTotal` | `SOLD_OUT` |
| acessórios | mesma conta, por support. Id repetido conta uma vez (D27). | `ACCESSORY_SOLD_OUT` → `ACCESSORY_SOLD_OUT_ERROR` |
| grava | o `on conflict` volta a linha para `PENDING`, zera `sync_error` e `attempts` e muda o `updated_at` | — |

**Ocupado** = `taken` do retrato + linhas `vou` locais `PENDING` com o grupo (ou o support). No
retrato local da fase 1: linhas `vou` que não estão `REJECTED`.

## Erros novos

| `key` | Status | Quando |
|---|---|---|
| `ACCESSORY_SOLD_OUT_ERROR` | 409 | o acessório pedido esgotou (função `reservar`) |
| `RESERVATION_REJECTED_ERROR` | 409 | o Transicionais recusou a reserva por outra regra (não é vaga nem prazo) |
| `UPSTREAM_UNAVAILABLE_ERROR` | 503 | o Transicionais não respondeu numa ação da Produção que não tem fila (data, hora, local, abertura) |
| `EVENT_CREATION_PENDING_ERROR` | 409 | "Encerrar" com o encerramento anterior ainda só no local (D51) |

`UNAUTHORIZED_ERROR` (401) vale também para cron e webhook. `SOLD_OUT_ERROR` e
`BOOKING_CLOSED_ERROR` também vêm da recusa do Transicionais.

**Falha de fonte (`InfraError`, `errors/infra-error.ts`).** Não é `AppError`: a rota responde 500
`INTERNAL_ERROR`, e o log traz a `key` e a `source` (`supabase` ou `transicionais`).

| `key` (só no log) | Quando |
|---|---|
| `DATABASE_ERROR` | o Supabase devolveu erro fora do `SQL_ERRORS` |
| `UPSTREAM_RESPONSE_ERROR` | o Transicionais devolveu um status sem tratamento (inclui 401/403 depois de renovar) |
| `INVALID_RESPONSE_ERROR` | a resposta não tem o formato do schema zod, ou o model a recusou |
| `ANSWER_CHANGED_ERROR` | `VALIDATION_ANSWER_CHANGED` no envio: o usecase deixa `PENDING` (`RETRY`), não chega à rota |
| `VERSION_CONFLICT_ERROR` | `EVENT_VERSION_CONFLICT` na Produção: o usecase relê a `version` e tenta uma vez mais; repetiu, 500 |

Um `Error` sem `key` no log é bug ou env ausente.

## Rotas

| Rota | Request | Response | `key` de erro |
|---|---|---|---|
| `GET /api/ensaio` | — | 200 `<ensaio>` | `NOT_FOUND`, `INTERNAL` |
| `POST /api/reserva` | igual à fase 1 | 201 `{ id, groupId, supportIds, name, pronoun, sync: "PENDING" \| "SYNCED" }` | os da fase 1 + `ACCESSORY_SOLD_OUT`, `RESERVATION_REJECTED` |
| `POST /api/reserva/desfazer` | `{ id }` | 204 | os da fase 1 + as recusas do Transicionais (D34) |
| `GET /api/minhas-reservas` | — | 200 `[{ id, groupId, groupName, supportIds, accessories: [{ id, name }], email, name, pronoun, sync, syncError }]` | `NOT_FOUND`, `INTERNAL` |
| `GET /api/admin/resumo` | — | 200 `<resumo>` | igual |
| `PUT /api/admin/ensaio` | parcial de `{ date, time, location, whatsappUrl, bookingOpen, stocks: [{ id, stockTotal }] }` | 200 `<resumo>` | `UNAUTHORIZED`, `INVALID_PARAMETER`, `NOT_FOUND`, `STOCK_BELOW_RESERVATIONS`, `UPSTREAM_UNAVAILABLE`, `INTERNAL` |
| `POST /api/admin/novo-ensaio` | — | 200 `<resumo>` | `UNAUTHORIZED`, `NOT_FOUND`, `UPSTREAM_UNAVAILABLE` (só no retrato local da fase 1), `EVENT_CREATION_PENDING`, `INTERNAL` |
| `GET /api/cron/event` | `Authorization: Bearer <CRON_SECRET>` | 200 `{ changed }` | `UNAUTHORIZED`, `INTERNAL` |
| `GET /api/cron/sync?type=nextEvent\|stock\|booking` | `Authorization: Bearer <CRON_SECRET>` | 200 `{ claimed, synced, rejected, pending, manualRetry }` do contexto | `UNAUTHORIZED`, `INVALID_PARAMETER` (`type`), `NOT_FOUND`, `INTERNAL` |
| `POST /api/webhooks/transicionais` | `Authorization: Bearer <JWT>` + envelope | 204 | `UNAUTHORIZED`, `INVALID_PARAMETER`, `INTERNAL` |

`POST /api/admin/entrar` não mudou.

**`<ensaio>`** (D22):

```
{ dayKey, date, time, location, bookingOpen, whatsappUrl, goingCount,
  instruments: [{ id, name, stockTotal, available, soldOut,
                  accessories: [{ id, name, available, soldOut }] }],
  stale, fetchedAt }
```

Saem `groups` e `supports`. `instruments[].id` é o `groupId` da reserva. Os `accessories` são os
que valem para o instrumento. `stockTotal`/`available` `null` = sem limite.

**`<resumo>`:**

```
{ event: { dayKey, date, time, location, bookingOpen, whatsappUrl, goingCount,
           stock: [{ id, name, type: "instrumento" | "acessorio", stockTotal, available, rotativo,
                     reservations: [{ name, pronoun, detail }] }] },
  attendances: [{ id, name, pronoun, groupId, supportIds, createdAt, sync }] }
```

`stock[].id` é o id da assistência (o do instrumento é o `instrumentSupportId`). Primeiro os
instrumentos, depois os acessórios. `detail` é, no instrumento, os acessórios da pessoa ("Sem
acessórios" se nenhum) e, no acessório, o instrumento dela (D30, D31).

### Regras das rotas

| # | Regra |
|---|---|
| RT9 | `available` = `stockTotal` − ocupado (a conta da `reservar`), nunca abaixo de 0. `soldOut` = não rotativo e `available === 0`. `goingCount` = linhas `vou` que não estão `REJECTED` (D8). |
| RT10 | `GET /api/ensaio` só chama o Transicionais quando o retrato não existe, é local da fase 1 ou tem mais de 5 min (`fetched_at`). Respondeu: grava e devolve `stale: false`. Não respondeu (ou não achou o encontro): o último retrato com `stale: true`. Sem nenhum retrato: 404. |
| RT11 | `minhas-reservas` traz as linhas `vou` deste aparelho, **inclusive as `REJECTED`**. `syncError` é a `key` do Hormônios, só com `REJECTED`. `accessories` deixa de fora o id que saiu do retrato (D30). |
| RT12 | `resumo`: `attendances` e `reservations` trazem só as linhas que contam (`vou` e não `REJECTED`). Quem ocupa pelo Transicionais entra no `available`, mas não na lista (D30). |
| RT13 | `PUT /api/admin/ensaio`: `whatsappUrl` grava local. `date`, `time`, `location` e `bookingOpen` vão ao `PUT manager-events/details/{id}` e aos dias. `date`/`time` vazios = não muda; fora de `YYYY-MM-DD`/`HH:MM` dá 400 (D7). Abrir/fechar é o prazo do convidado (D1). |
| RT14 | `stocks[].id` é um id de `stock[]`. Desconhecido, sem limite (`stockTotal` null), repetido ou não inteiro ≥ 0: 400. Só os que mudaram vão ao Transicionais (`PUT manager-support-types/{id}`, objeto inteiro, D26). Não rotativo abaixo do ocupado: 409 e nada é gravado (D29). |
| RT15 | Trocar a data muda o dia no Transicionais. As linhas locais vão para o dia novo como `PENDING` (`migrar_fase1`, D7). |
| RT16 | Depois de gravar no Transicionais, a Produção relê o retrato. Fora do ar (antes ou na releitura): 503 (D12). Se o retrato ainda é o local da fase 1, a Produção lê o Transicionais antes. |
| RT17 | `novo-ensaio`: cria o próximo encontro (mesmo nome e ciclo, local "A definir", data do dia atual + 7, mesmo horário, mesmos grupos e assistências, reservas fechadas), grava o retrato dele e não mexe no antigo (D2, D16, D18). O resumo volta sem presenças, com a data e a hora do novo. Transicionais fora: o próximo nasce só no local e o cron o cria lá (D51). |

## Estrutura do código (refatoração de 2026-10-25)

Sem mudança de comportamento nas rotas (as respostas foram comparadas com `diff` antes e depois).

| Peça | Onde | O que mudou |
|---|---|---|
| Formato cru das fontes | `repos/<fonte>/responses/*.response.ts` e `requests/*.request.ts` | schema zod + `toDomain`/`fromDomain`. Saíram os `IRaw*` de `interfaces/` e os `mapper*` dos repos. A resposta é validada por `parseResponse` (fora do formato: `INVALID_RESPONSE_ERROR`); o corpo do webhook, por `parseInput` (400). |
| Models novos | `models/` | `EventDay`, `PublicationSettings`, `GroupCapacity`, `ManagedEvent`, `LoanCatalog` (com `LoanCatalogKind`) e os do webhook. |
| Conta das vagas | `models/current-event.ts` | métodos de `Instrument` e `Accessory` que recebem as reservas: `countTaken`, `available`, `soldOut`, `isBelowBookings` (D29). `CurrentEvent` ganhou `findAccessory`, `findStock` (o estoque ajustável pelo id da assistência) e `goingBookings`. |
| Respostas das rotas | `models/` + `usecases/<contexto>/mappers/` | a resposta é model: `PublicEvent` (`<ensaio>`, com `PublicInstrument` e `PublicAccessory`), `CurrentEventSummary` (`<resumo>`, com `SummaryEvent`, `SummaryStockItem`, `SummaryStockBooking` e `SummaryAttendance`) e `UserBooking` (`minhas-reservas`, com `UserBookingAccessory`). Montados por `public-event.mapper.ts`, `current-event-summary.mapper.ts` e `my-reservation.mapper.ts`, que só formatam. O JSON é o mesmo de antes. O `usecases/event-summary.ts` deixou de existir. |
| Ids do Transicionais | `repos/transicionais/transicionais-id.ts` | `TransicionaisIdSchema` (número ou texto → `string`) e `numericId` (`string` → número, na ida). |
| Regra fora do repo | usecases | o repo só faz I/O (R12): o "primeiro encontro de hoje" e a data de busca do `findManagedEvent(ref, from)` vêm do usecase; o envio da reserva devolve o aceito ou lança, e o `SyncingUserBookingUsecase` escolhe o `SyncMode` (tabela do envio). |
| Log | `lib/logger.ts` | uma linha JSON por registro (`level`, `time`, `scope`, campos, `msg`; o erro em `err`, com `key` e `source` no `InfraError`). Substitui os `console.*`. |
| Conjuntos fechados | enums | `HttpMethod`, `LoanCatalogKind` (também o `type` do `stock[]` do `<resumo>`), `BookingSync`, `SyncMode` etc. Os textos não mudaram. |

### Nomes e pastas (2026-10-26)

Sem mudança de rota, JSON, key de erro nem tabela/função SQL.

| Peça | Antes | Agora |
|---|---|---|
| Reserva e presença | `Attendance`, `AdminAttendance`, `MyReservation`, `StockReservation`, `AttendanceSync`… | `Booking`, `SummaryAttendance`, `UserBooking`, `SummaryStockBooking`, `BookingSync`… (a linha de `hg_attendances`) |
| Resumo da Produção | `AdminSummary` | `CurrentEventSummary` |
| Usecases | `reserve`, `cancel-reservation`, `list-my-reservations`, `send-attendance`, `sync-pending-attendances`, `get-event`, `admin-summary`, `update-event`, `new-event`, `refresh-current-event`, `receive-transicionais-webhook` | gerúndio + objeto, por contexto: `booking/` (`creating-user-booking`, `canceling-user-booking`, `finding-user-bookings`), `event/` (`finding-current-event`, `finding-current-event-summary`, `updating-current-event`, `creating-next-event`) e `sync/` (`receiving-current-event`, `syncing-next-event-pending`, `syncing-stock-pending`, `syncing-booking-pending`, `syncing-user-booking`, `receiving-transicionais-webhook`). `syncing-*` envia ao Transicionais; `receiving-*` recebe de lá. |
| Mappers | `usecases/mappers/` | `usecases/<contexto>/mappers/` |

### Renomeação dos models (2026-10-26, migration `0011_renomeacao.sql`)

O JSON das rotas não muda, exceto a key de erro `NEXT_EVENT_PENDING_ERROR` → `EVENT_CREATION_PENDING_ERROR`
(o `app.js` acompanha). Mudam as tabelas e funções da fila, os `kind` e as chaves do jsonb do retrato.

| Antes | Agora |
|---|---|
| `AdminBooking`, `AdminEvent`, `StockItem`, `StockBooking` | `SummaryAttendance`, `SummaryEvent`, `SummaryStockItem`, `SummaryStockBooking` |
| `EventView`, `EventInstrument`, `EventAccessory`, `EventViewMapper` | `PublicEvent`, `PublicInstrument`, `PublicAccessory`, `PublicEventMapper` |
| `Group`, `Support` (em `current-event.ts`); `CurrentEvent.groups`, `supports`, `findGroup`, `supportsForGroup`, `findSupport` | `Instrument`, `Accessory`; `instruments`, `accessories`, `findInstrument`, `accessoriesForInstrument`, `findAccessory`. Os ids (`groupId`, `supportIds`, `instrumentSupportId`) ficam. |
| `EventSnapshot`, `EventPublication`, `GroupVacancy` | `CurrentEventSnapshot`, `PublicationSettings`, `GroupCapacity` |
| `SupportType` (`SupportTypeKind`) | `LoanCatalog` (`LoanCatalogKind`); repo: `findLoanCatalog`, `saveLoanCatalog` |
| `PendingWrite` (`PendingWriteKind`, `PendingWriteMode`), `PendingSupportCapacity`, `PendingNextEvent` | `PendingSync` (`PendingSyncKind`, `PendingSyncMode`), `PendingStockUpdate`, `PendingEventCreation` |
| `NextEventPendingError` | `EventCreationPendingError` |
| `hg_pending_writes`, `claim_escritas`, `marcar_escrita`; `kind` `SUPPORT_CAPACITY`/`NEXT_EVENT`; erro SQL `NEXT_EVENT_PENDING`; `encerrar_local(p_data, p_write)` | `hg_pending_syncs`, `claim_syncs`, `marcar_sync_pendente`; `STOCK_UPDATE`/`EVENT_CREATION`; `EVENT_CREATION_PENDING`; `encerrar_local(p_data, p_sync)` |
| jsonb do retrato e `p_taken`: `groups`, `supports` | `instruments`, `accessories` (a 0011 converte os gravados) |

Ficam: `Booking`, `CurrentEvent`, `CurrentEventSummary`, `EventDay`, `ManagedEvent`, `UserBooking`,
`UserBookingAccessory`, `User`, os nomes dos usecases e o `--type` do cron.

## Tradução Hormônios ↔ Transicionais

Só no repo `repos/transicionais/`. A leitura são dois GETs (D14): a listagem de manager
(`GET v2/manager-events/details?visibility=PUBLIC&startAt=<hoje em SP>&orderBy=startAt:asc`, com
token) acha o encontro e o dia; a rota pública
(`GET v2/community/organizations/{TRANSICIONAIS_ORG_ID}/events/{externalId}?dayId=`, sem token) traz o
resto.

| Hormônios | Transicionais |
|---|---|
| `dayKey` | `String(configDayId)` do primeiro item da listagem |
| `externalId` | `externalId` da listagem (= `public.id`, D6) |
| `date` / `time` | `configDays[].current` (`YYYY-MM-DD`) / `startTime` (`HH:mm`) do dia |
| `location` | `location` do encontro |
| `bookingOpen` | `public.answerWindow.open && !closed` |
| `version` | `version` do GET público |
| instrumentos e acessórios | `configDays[].summary.supports` do dia (E2.9, tabela do jsonb) |
| `whatsappUrl` | só do Hormônios |
| `answer: "vou"` / `"nao-vou"` | `status: ATTENDING` / `DECLINED` (no webhook, `TENTATIVE` = `nao-vou`, D37) |

O `vacanciesAt` do retrato é a hora da leitura (D5).

**Sessão (E2.6).** Token e refresh ficam na memória da instância. Num 401, tenta o refresh; se
falhar, entra de novo; e reenvia uma vez. O envio da reserva também renova no 403 (D40). Login com
credencial errada é erro de configuração (500), não queda. Todo pedido tem timeout de 3 s.

## Envio da reserva

Com o token de membro, pelas rotas de manager (E2.8 revista, D41). Quem orquestra é o
`SyncingUserBookingUsecase`:

0. `GET v2/manager-validations/guests?configDayIds=<dia>&search=<e-mail>` → a presença da pessoa no
   dia, com `hash` e `orderId` (D49). Se a resposta, o grupo e as assistências já são os da linha
   local, a linha vira `SYNCED` sem os passos 1 e 2.

1. `POST v2/manager-organization/users` → a conta da pessoa (idempotente pelo e-mail): `profileGuestId`
   (convidado) ou `profileId` (o e-mail é de membro).

   ```
   { type: "GUEST", name, email, pronouns }
   ```

2. `POST v2/manager-validations/change` em nome da conta. Qualquer 2xx (`APPROVED` ou `ALREADY`) é
   aceito.

   ```
   { type: "ATTENDANCE", configDayId, profileGuestId | profileId,
     status: "ATTENDING" | "DECLINED", groupId?, supportTypeIds }
   ```

Se o passo 0 ou o 1 falha, os seguintes não são enviados, e a falha segue a mesma tabela. Depois do
passo 2, a presença é relida só para gravar o `hash` e o `orderId` (`hg_attendances.transicionais_hash`,
migration 0008); se a releitura falhar, o envio vale e fica sem `hash`.

- `supportTypeIds` = a assistência do instrumento + os acessórios. Só presença ou "Não vou": sem
  `groupId` e vazio.
- Vai com `x-forwarded-for` = IP real da pessoa (R4). No cron, sem IP.
- Sem `idempotencyKey`: reenviar a mesma resposta devolve `ALREADY`. O `order_id` e o `changed_at`
  não vêm no envio e só chegam pelo webhook `validation.changed`.

**Quem envia.** A reserva e o "Não vou" enviam na hora, depois de gravar local. O cron envia o que
ficou `PENDING`. Não envia: retrato local da fase 1, linha de outro dia ou que não está `PENDING`
(D32).

| Resposta | Linha (`marcar_sync`) | Rota de reserva/desfazer |
|---|---|---|
| 2xx (ou a presença de lá já igual, D49) | `SYNCED`, o `hash` e o `order_id` da presença relida, e o `guest_id` da pessoa = `profileGuestId` (unique: se já for de outra, não troca; membro ou presença já igual: fica como estava). `changed_at` fica como estava | 201 `sync: "SYNCED"` / 204 |
| outro 404 (ex.: `VALIDATION_EVENT_NOT_FOUND`) | `PENDING`, modo `BACKOFF` + log de erro (D44). As recusas de regra (`…_FULL`, `…_ANSWER_CLOSED`, prazo) são 409/400 e caem no `MANUAL_RETRY` (D50) | 201 `PENDING` / 204 |
| `VALIDATION_ANSWER_CHANGED` | `PENDING`, modo `RETRY` (`next_attempt_at = now()`) | 201 `PENDING` / 204 |
| 400, 409 ou 422 (menos `VALIDATION_ANSWER_CHANGED`) | `MANUAL_RETRY` com o `error_cause` (o erro como veio): sai do cron até o ajuste manual (D50) | 201 `sync: "MANUAL_RETRY"` / 204 |
| 401/403 depois de renovar, ou 404 `NOT_FOUND` (conta do BFF sem ADMIN/MANAGER) | `PENDING`, modo `BACKOFF` + log de erro | 201 `PENDING` / 204 |
| 0 (rede, timeout), 429, 5xx, outro status, exceção | `PENDING`, modo `BACKOFF` (`attempts + 1`, volta na próxima chamada do cron: quem chama decide o ritmo, D46) | 201 `PENDING` / 204 |

- `marcar_sync` só grava se o `updated_at` é o lido antes do envio e a linha está `PENDING`. Se a
  linha mudou durante o envio (ou um webhook já a resolveu), nada é gravado e a rota responde
  `PENDING`.
- Uma falha do envio nunca derruba a reserva local (D32).
- O envio não grava mais `REJECTED` (D44): a linha fica `PENDING` até sincronizar de fato. As linhas
  `REJECTED` de antes continuam valendo como `nao-vou`.

## Cron

| Rota | O que faz |
|---|---|
| `GET /api/cron/event` | `refreshCurrentEvent()`: lê o Transicionais e grava com `gravar_retrato`. Na primeira leitura sobre o retrato local, chama `migrar_fase1`. `changed` = o retrato mudou. Fora do ar: 200 `{ changed: false }`. |
| `GET /api/cron/sync?type=` | Um usecase por contexto: `nextEvent` (o "Encerrar" da fila, D51), `stock` (o estoque da fila, até 5, D53) e `booking` (as reservas `PENDING`, `claim_pending(10)` de todos os dias do Transicionais, D45, em paralelo; com retrato local, nenhuma). Responde a contagem por resultado: `{ claimed, synced, rejected, pending, manualRetry }`. |

`requireCron` compara o `Authorization` com `Bearer <CRON_SECRET>` por hash SHA-256, em tempo
constante. Para chamar à mão: `yarn cron:event` e `yarn cron:sync --type=<nextEvent|stock|booking>` (`scripts/cron.mjs`, com
`BFF_URL` opcional).

## Webhooks

`POST /api/webhooks/transicionais`, envelope `{ deliveryId, type, occurredAt, organizationId, data }`.

> **Em rascunho (2026-10-25).** O código do webhook está marcado com `@deprecated` e `// em rascunho`
> até a revisão da Bea. Não está em uso: o Transicionais ainda não chama esta rota.

| # | Regra |
|---|---|
| W1 | **JWT** (`verifyWebhookJwt`): HS256 com `TRANSICIONAIS_JWT_KEY`, `exp` no futuro e `role: "SERVICE"`. `aud` é opcional; se vier, precisa ter `hormonios`. Falhou: 401. |
| W2 | Sem `deliveryId` ou `type`, ou `data` fora do formato: 400, sem gravar. |
| W3 | **Deduplicação:** grava o `deliveryId` em `hg_webhook_deliveries` antes de processar. Já existia: 204 sem processar. O processamento falhou: apaga o registro e responde 500, para o reenvio passar (D38). |
| W4 | Tipo desconhecido: grava, registra no log e 204. |
| W5 | **`event.updated`:** mesma tradução do GET público (`PublicEventResponse`), com o dia do retrato atual (D35). `externalId` de outro encontro ou retrato local da fase 1: ignora. Grava com `gravar_retrato` (mesma trava). Sem o dia no `configDays`, sem `version` ou com a tradução falha: chama `refreshCurrentEvent()`. |
| W6 | **`validation.changed`:** `aplicar_validacao` acha a linha pelo `orderId`; senão a pessoa pelo `guestId` (primeiro) ou pelo e-mail, e a linha pelo dia. Aplica só se `changedAt` > `transicionais_changed_at` e se não há mudança local mais nova (`PENDING` com `updated_at` > `changedAt`). Grava `data`, `order_id`, `changed_at` e `SYNCED`. As assistências de instrumento saem de `supportTypeIds` (D37). |
| W7 | Pessoa fora de `hg_users` (B6) ou sem linha no dia: não cria linha (D37). |
| W8 | **Vagas:** só `data.dayVacancies.supports: [{ id \| supportTypeId, occupied }]` é usado, por `gravar_vagas` (D36). Sem `supports`, as vagas esperam o cron de 5 min. |

## Plano de falha

| Falha | Comportamento |
|---|---|
| Transicionais fora ou lento (> 3 s) na leitura | `GET /api/ensaio` responde o último retrato com `stale: true` e o `fetchedAt` dele. |
| Nenhum encontro Público de hoje em diante | Igual a fora do ar: fica o último retrato, `stale: true`, e um aviso no log. |
| Transicionais fora na reserva ou no "Não vou" | A linha fica `PENDING` contra as vagas do retrato. O cron envia depois. |
| Vaga tomada lá enquanto ele estava fora | O envio volta recusado, a linha continua `PENDING` (volta na próxima chamada do cron, D46) e a `key` vai para o log (D44). |
| Transicionais fora no estoque | Vai para a fila (`STOCK_UPDATE`) e o retrato já mostra o valor novo. O cron envia depois; recusado, volta o valor de lá (D52, D53). |
| Transicionais fora no "Encerrar" | O próximo nasce só no local (fechado) e o cron o cria lá. Até lá, o retrato local é a verdade, o "Salvar" só aceita estoque e WhatsApp, e outro "Encerrar" dá 409 (D51). |
| Transicionais fora em data, hora, local ou abertura | 503 `UPSTREAM_UNAVAILABLE_ERROR`. Repetir é seguro (D12). |
| Webhook perdido | O cron de 5 min corrige o retrato. A resposta de cada envio corrige a reserva. |
| Webhook repetido ou fora de ordem | `deliveryId`, `version` e `changedAt`: não muda nada. |
| Duas execuções do cron | `claim_pending` com `skip locked`: nunca pegam a mesma linha. |

## O que falta

- **Worker do Cloudflare (`cron/`):** não existe. As rotas `/api/cron/*` estão prontas, mas nada as
  chama sozinho. Hoje só pelo `yarn cron:event`/`cron:sync` (onda 4).
- **Front:** o aviso de `stale` e o status do envio em "Minhas reservas" ainda não aparecem
  (onda 4). Ver [`../front/fase-2.md`](../front/fase-2.md).
- **Verificação (onda 5):** não há testes automatizados. Não foram verificados com fakes: a trava do
  retrato, `claim_pending` em paralelo, a trava do `updated_at`, os webhooks e `migrar_fase1`.
- **Testado contra o dev pela Bea:** a leitura do encontro, a Produção e as regras de reserva da E2.9.
  **Não testados:** o envio da reserva, o cron de sync e os webhooks.
- **Chamada real ao envio pelas rotas de manager (`manager-organization/users` e
  `manager-validations/change`):** não feita (D41).
- **`dayVacancies` por assistência no webhook:** depende do Transicionais mandar `supports` com o
  `occupied` (D36).
- **Role `SERVICE` (T2.4/T2.5):** o BFF ainda entra como membro (E2.6) e escreve pela rota de
  convidado (E2.8).
