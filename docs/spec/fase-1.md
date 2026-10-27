# Refactor do domain — fase 1: usecases sobre o contrato novo

> **Concluído em 2026-10-27.** O que foi implementado está em [Como ficou](#como-ficou-2026-10-27). A
> sincronização com o Transicionais (fase 3 do plano) está em [`fase-2.md`](fase-2.md).

> Feito com a Bea em 2026-10-26. Os usecases antigos (`src/serve-utils/usecases/`) são apagados:
> regras confusas, muita linha para pouca coisa. Os novos partem do contrato em
> `src/serve-utils/domain/` (`Event`, `Attendance`, `User`, `ManagerEvent`), do
> `IHormoniosRepository` e da `supabase/migrations/v1__create_event.sql`. O código antigo
> (models, repo, usecases) não serve de base. A Bea apaga os usecases antigos e as docs
> desatualizadas deles; este plano não cita nem atualiza essas docs.

## Decisões

| # | Decisão |
|---|---|
| D1 | **Banco mínimo:** em coluna só ids e chaves de consulta; o resto vai no jsonb `data`, pelo `toJson()`. Sem função SQL: a regra fica no usecase. |
| D2 | **O evento atual é o mais recente** por `created_at`: `findCurrentEvent()` no repo, sem coluna nova. O público recebe o `Event`. |
| D3 | **O cookie guarda só o `userId`.** Nome, pronome e presenças vêm do banco. |
| D4 | **`User.attendances: Attendance[]`** (lista), no lugar de `attendance: Attendance \| null`. |
| D5 | **`ManagerEvent`** = o `Event` + as pessoas com as presenças (`users: User[]`). A presença não repete o evento: liga pelo `event.id`. |
| D6 | **Estado de sync igual nos três:** `sync` (`PENDING`, `SYNCED`, `REJECTED`, `MANUAL_RETRY`), `syncError`, `hash` e `syncedAt` no metadata de `Event`, `User` e `Attendance`. O `isSynced` do Event sai. |
| D7 | **Id do Transicionais no jsonb:** `metadata.integrationId` em `User` e `Attendance`; a busca é por `data->metadata->>integrationId`, sem coluna. |
| D8 | **Repo simplificado:** `createEvent` e `updateEvent`; `createOrUpdateUser` e `createOrUpdateAttendance` no lugar dos pares create/update. |
| D9 | **Webhooks:** `POST /api/webhooks/transicionais` e `POST /api/webhooks/cloudflare` (D17), com o header `api-key` e `x-client-id` conferidos com um valor só no `.env` (`WEBHOOK_API_KEY`, `WEBHOOK_CLIENT_ID`). |
| D10 | **`lastUpdate` mais velho que o `syncedAt` gravado:** o webhook é ignorado e responde `success: true`. O `requestId` (idempotência) ainda não é gravado. |
| D11 | **Nomes:** arquivo com o nome da classe (`FindingPublicEventUsecase.ts`); `Recieve*` vira `Receiving*`. |

## Usecases

### Fase 1: CRUD no Supabase

| Usecase | Entrada | Saída | Rota |
|---|---|---|---|
| `FindingInternalEventUsecase` | — | `ManagerEvent` | `GET /api/admin/ensaio` |
| `CreatingInternalEventUsecase` | o corpo do evento | `Event` | `POST /api/admin/novo-ensaio` |
| `FindingPublicEventUsecase` | — | `Event` | `GET /api/ensaio` |
| `CreatingUserBookingUsecase` | o corpo da reserva | `User` (com `attendances`) | `POST /api/reserva` |
| `FindingUserBookingUsecase` | `userId` (cookie) | `User` (com `attendances`) | `GET /api/minhas-reservas` |
| `UpdatingInternalEventUsecase` | o corpo do evento | `Event` | `PUT /api/admin/ensaio` (D13) |
| `CreatingOrUpdatingAttendanceUsecase` | a presença com a `answer` | `User` (com `attendances`) | `POST /api/reserva/desfazer` (D15) |

## Repo (`IHormoniosRepository`)

| Método | Fase | Situação |
|---|---|---|
| `findEvent(id)` | 1 | existe |
| `findCurrentEvent()` | 1 | novo (D2) |
| `createEvent(event)` · `updateEvent(event)` | 1 | existem |
| `findUser(email, event)` | 1 | muda com D4 (presenças do evento, D16) |
| `findUserById(id, event)` | 1 | novo (D3, D16) |
| `createOrUpdateUser(user)` | 1 | substitui `createUser`/`updateUser` (D8) |
| `findAttendance(id, event)` · `findEventAttendance(event)` | 1 | existem |
| `createOrUpdateAttendance(attendance)` | 1 | substitui `createAttendance`/`updateAttendance` (D8) |
| `find<Event\|User\|Attendance>BySync(status, limit)` | 3 | novos, para o `SyncJobRequest` |
| `find<Event\|User\|Attendance>ByIntegrationId(id)` | 3 | novos (D7) |

## Domain

- `User`: `attendance` → `attendances: Attendance[]` (D4); ganha `UserMetadata` com `integrationId`
  e o estado de sync (D6, D7).
- `Attendance`: `metadata.integrationId` (D7).
- `Event`: `isSynced` → `sync` e `syncError` (D6).
- O enum `AttendanceSync` vira um enum comum aos três (ex.: `domain/SyncStatus.ts`).

## Ordem

1. Domain e repo (D4, D6, D7, D8, `findCurrentEvent`, `findUserById`).
2. Fase 1: os usecases e as rotas (com a edição do evento e o desfazer). Tirar o `resumo`.
3. Fase 3: os `Syncing*` (cron) e os `Receiving*` (webhooks).

`yarn typecheck` e `check.cjs` ao fim de cada passo.

4. **Ao fim do desenvolvimento:** atualizar as specs (`docs/spec/back/` e `docs/spec/front/`), as
   únicas docs que a Bea mantém. Não atualizar spec durante os passos 1 a 3.

## Decisões dos pontos em aberto (2026-10-26)

| # | Decisão |
|---|---|
| D12 | **O `ReceivingUsecase` mapeia** o `entityId` para o usecase do cenário. |
| D13 | **Editar o evento ganha usecase** (`PUT /api/admin/ensaio`, ex.: `UpdatingInternalEventUsecase`), na fase 1. |
| D14 | **`GET /api/admin/resumo` sai:** o `FindingInternalEvent` (`ManagerEvent`) cobre. `POST /api/admin/entrar` fica como está. |
| D15 | **Desfazer é o endpoint do `CreatingOrUpdatingAttendanceUsecase`** (`createOrUpdateAttendance` no repo): grava a presença com `answer: nao-vou`, sem apagar a linha. **"Não vou" é diferente de "nem vi":** "não vou" é uma presença gravada com `nao-vou`; "nem vi" é não ter presença no evento. |
| D16 | **As presenças do `User` são só as do evento atual:** `findUser`/`findUserById` recebem o `Event` e leem as presenças da pessoa nele. |
| D17 | **A pasta das rotas fica `api/webhooks/`:** `/api/webhooks/transicionais` e `/api/webhooks/cloudflare`. |

## Execução (2026-10-26)

| # | Decisão |
|---|---|
| D18 | **Passos 1 a 3 por subagente, um por vez**, com revisão entre eles. Dúvidas não bloqueantes vão para [`create-domain-duvidas.md`](create-domain-duvidas.md). |
| D19 | **O JSON das rotas muda** para o `toJson()` do domain. O front (`app.js`) fica para outra etapa. |
| D20 | **Passo 3 não é implementado:** vira um plano em `docs/plans/` com a assinatura de exemplo (rascunho, sem comentários no código) só dos usecases de **User** (`SyncingUser`, `ReceivingUser`). Provável: guardar o response inteiro do Transicionais no metadata, para facilitar a integração. |
| D21 | **`repos/transicionais/` fica:** é a integração com a API. Os models que ele importava foram apagados; ele volta a compilar no passo 3. Até lá, o `typecheck` dos passos 1 e 2 ignora os erros de `repos/transicionais/` e `interfaces/transicionais.ts`. |
| D22 | **Nomes do sync iguais nos três metadata:** `sync`, `syncError`, `syncHash`, `syncedAt` (como já está na `AttendanceMetadata`). O `hash` do Event vira `syncHash`; o `fetchedAt` fica (é a última leitura, não o envio); a coluna `"syncedAt"` de `event` passa a vir de `metadata.syncedAt`. |
| D24 | **Sem comentários no código:** no máximo citar a regra ou a decisão (ex.: `// D16`). |
| D25 | **Código linha por linha:** nada de `if (await a.b().c())` nem chamada encadeada em condição ou argumento; cada chamada numa `const`, e o `if` usa a variável. |
| D26a | **Cookie só com o `userId`, aceito por agora:** quem reserva com o email de outra pessoa recebe o `userId` dela (vê e desfaz a reserva dela). Fica assim até o login por email (fase 3). |
| D26b | **`validateSchema` volta**, em `lib/schema.ts`, com os schemas comuns (`NonBlankSchema`, `UuidSchema`, `CountSchema`, `DateOnlySchema`, `DateTimeSchema`). Devolve a entrada já normalizada (`z.infer`). Os usecases usam ele no lugar do `parseInput`; o `check.cjs` isenta `lib/schema.ts` da regra `safe-parse`. |
| D23 | **`EventVisibility`** (`PUBLIC`, `PRIVATE`) passa para `domain/Event.ts`: o `models/publication-settings` foi apagado. |

## Como ficou (2026-10-27)

O detalhe do que foi implementado, para agente. As histórias e o changelog estão em
[`docs/plans/back/`](../plans/back/README.md) e [`docs/plans/front/`](../plans/front/README.md); o que cada
usecase faz, em [`docs/usecases/`](../usecases/README.md).

### Back — fase 1

#### Visão geral

- Vercel Functions no próprio repo: cada arquivo de `api/` é uma rota. Handlers no formato Web
  (`GET(request: Request)`), sem `node:*`.
- O BFF é o único que acessa o Supabase, com a `service_role`.
- Sem login. A pessoa se identifica pelo e-mail na folha. O cookie `hg_user` guarda o id dela, e o
  `hg_device` guarda o aparelho. A Produção entra com uma chave, e a sessão fica no `hg_admin`.
- O contrato é o domain em `src/serve-utils/domain/`: `Event`, `User`, `Attendance` e
  `ManagerEvent`. O banco grava o `toJson()` de cada um, e as rotas respondem um recorte dele
  (`api/_responses/`).

#### Envs

| Env | Uso |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (só no servidor) |
| `ADMIN_KEY` | chave da Produção, digitada no login |
| `COOKIE_KEY` | segredo do HMAC que assina o `hg_admin` |
| `TRANSICIONAIS_ORG_ID` | entra no `emailHash` (`md5(e-mail + org)`) de `minhas-reservas` |

As envs são lidas na chamada que precisa delas. Env ausente vira 500 `INTERNAL_ERROR`.

#### Domain

| Classe | Na raiz (o que a tela usa) | Em `metadata` (o resto) |
|---|---|---|
| `Event` | `id`, `location`, `whatsappUrl`, `date` (`YYYY-MM-DD`, vazia = a definir), `startTime` (`HH:mm` ou `null`), `bookingOpen`, `groups`, `catalog`, `goingCount` | `name`, `categoryId`, `endTime`, `description` (visibilidade, texto, datas, `totalVacancies`), os ids e o estado de integração |
| `EventGroup` | `id`, `name`, `capacity` (vagas que sobram no grupo) | `active`, `exclusiveCapacity` |
| `EventCatalog` | `id`, `name`, `stock` (`total`, `rotative`, `used`, `free`) | `type` (`INSTRUMENT` ou `ACCESSORY`), `groupIds` |
| `User` | `id`, `name`, `pronoun`, `email`, `attendances` | `integrationId`, `account` e o estado de integração |
| `Attendance` | `id`, `event`, `eventGroup`, `catalog`, `createdAt` | `userId`, `deviceId`, `answer` (`vou` ou `nao-vou`), `integrationId` e o estado de integração |
| `ManagerEvent` | `event` + `users` (cada um com as presenças dele no evento) | — |

- Por conveniência, a raiz também expõe alguns campos do metadata (`Event.name`, `EventGroup.active`,
  `EventCatalog.type`, `Attendance.answer`, `Attendance.sync`...). Eles são preenchidos em memória.
- O estado de integração é igual nos três (`sync`, `syncError`, `syncHash`, `syncedAt`) e é
  descrito na [fase 2](fase-2.md#back--fase-2). Na fase 1, todo registro novo nasce com `sync: PENDING`.
- As presenças de um `User` são só as do evento atual.

##### Contas (`Event.withAttendances`)

| # | Regra |
|---|---|
| C1 | Uma presença **conta** quando a `answer` é `vou` e o `sync` não é `REJECTED`. |
| C2 | `goingCount` é o número de presenças que contam, com e sem instrumento. |
| C3 | `stock.used` de um `INSTRUMENT` conta as presenças em um dos `groupIds` dele. O de um `ACCESSORY` conta as presenças que o pediram. |
| C4 | `stock.free` vale `max(total − used, 0)`. É `null` (sem limite) quando `total` é `null` ou o item é `rotative`. |
| C5 | `capacity` de um grupo vale `max(exclusiveCapacity − presenças no grupo, 0)`. Só aparece na visão da Produção e nas validações da reserva; no público, é `null`. Fica `null` também quando o grupo não tem `exclusiveCapacity`. |

#### Banco (`v1__create_event.sql`)

Em coluna ficam só os ids e as chaves de consulta. O resto vai no jsonb `data`, pelo `toJson()` do
domain. Não há função SQL: a regra fica no usecase.

| Tabela | Colunas |
|---|---|
| `event` | `id` uuid, `integrationId` bigint, `transicionaisDayId` bigint, `syncHash`, `syncedAt`, `data`, `created_at`, `updated_at` |
| `"user"` | `id` uuid, `email` text **unique**, `data`, `created_at`, `updated_at` |
| `attendance` | `id` uuid, `eventId` → `event`, `userId` → `"user"`, `syncHash`, `syncedAt`, `data`, `created_at`, `updated_at` |

- RLS ligada nas três, sem nenhuma política.
- **O evento atual é o mais recente por `created_at`.** Não existe coluna de "atual": criar um
  evento já o torna o atual, e os anteriores ficam como histórico.
- O `integrationId` da pessoa e o da presença ficam só no jsonb. A busca é por
  `data->metadata->>integrationId`.

#### Erros

Todo erro é `{ key, message }` com o status abaixo.

| `key` | Status | Quando |
|---|---|---|
| `INVALID_PARAMETER_ERROR` | 400 | corpo não é objeto JSON; campo inválido; grupo inexistente ou inativo; acessório fora do evento ou do grupo; tirar do evento um grupo ou item que alguma presença usa |
| `UNAUTHORIZED_ERROR` | 401 | chave errada no login; `hg_admin` ausente, inválido ou vencido |
| `NOT_FOUND_ERROR` | 404 | não há evento atual; `minhas-reservas` sem `hg_user` ou com pessoa inexistente; evento a editar não existe |
| `BOOKING_CLOSED_ERROR` | 409 | `vou` com as reservas fechadas |
| `SOLD_OUT_ERROR` | 409 | evento cheio (`totalVacancies`), instrumento esgotado ou grupo sem `capacity` |
| `ACCESSORY_SOLD_OUT_ERROR` | 409 | acessório esgotado |
| `ALREADY_RESERVED_ERROR` | 409 | a pessoa já tem outro instrumento no evento |
| `STOCK_BELOW_RESERVATIONS_ERROR` | 409 | `stock.total` novo abaixo das presenças que usam o item (menos rotativo) |
| `INTERNAL_ERROR` | 500 | qualquer outro erro (Supabase, env ausente, corpo sem os campos que o `EventRequest` lê) |

`EVENT_CHANGED_ERROR` e `EVENT_CREATION_PENDING_ERROR` ainda estão no `ErrorKey`, mas nenhum código
os lança.

#### Rotas

| Rota | Usecase | Request | Response |
|---|---|---|---|
| `GET /api/ensaio` | `FindingPublicEventUsecase` | — | 200 `<ensaio>` |
| `POST /api/reserva` | `CreatingOrUpdatingAttendanceUsecase` | `<reserva>` | 201 `<pessoa>` + `hg_user` (e `hg_device`, se faltava) |
| `POST /api/reserva/desfazer` | `CreatingOrUpdatingAttendanceUsecase` | `<reserva>` | 200 `<pessoa>` + `hg_user` (e `hg_device`, se faltava) |
| `GET /api/minhas-reservas` | `FindingUserBookingUsecase` | — (lê o `hg_user`) | 200 `<minha-reserva>` |
| `POST /api/admin/entrar` | — | `{ key }` | 204 + `hg_admin` |
| `GET /api/admin/ensaio` | `FindingInternalEventUsecase` | — | 200 `<produção>` |
| `PUT /api/admin/ensaio` | `UpdatingInternalEventUsecase` | `<evento>` | 200 `<produção>` |
| `POST /api/admin/novo-ensaio` | `CreatingInternalEventUsecase` | `<evento>` sem `id` | 201 `<ensaio>` |

As rotas `admin/*`, menos `entrar`, chamam `requireAdmin` na primeira linha. A rota não valida
nada: o usecase valida a entrada inteira pelo schema zod dele.

##### Formatos

Nenhuma resposta da fase 1 traz o `metadata` do domain.

- **`<ensaio>`** (`EventResponse`): `{ id, name, location, whatsappUrl, date, startTime, endTime,
  bookingOpen, goingCount, categoryId, description, integrationId, groups: [{ id, name, active,
  capacity }], catalog: [{ id, name, type, groupIds, stock: { total, rotative, used, free } }] }`.
- **`<presença>`** (`AttendanceResponse`): `{ id, eventId, groupId, supportIds, answer, sync,
  createdAt }`. `groupId` `null` é só presença.
- **`<pessoa>`** (`UserResponse`): `{ id, name, pronoun, email, attendances: <presença>[] }`.
- **`<minha-reserva>`** (`UserBookingResponse`): como `<pessoa>`, mas o `email` vem anonimizado
  (`be***iz@gmail.com`), com o `emailHash` e o `account` da pessoa no Transicionais.
- **`<produção>`** (`ManagerEventResponse`): `{ event: <ensaio>, users: <pessoa>[] }`. O `event`
  tem o `capacity` dos grupos.
- **`<reserva>`**: `{ email, name, pronoun, answer: "vou" | "nao-vou", groupId: string | null,
  supportIds: string[], emailHash: string | null }`.
- **`<evento>`** (`api/admin/_requests/EventRequest.ts`): `{ id?, name, location, whatsappUrl,
  date, startTime, endTime, bookingOpen, categoryId, description, groups: [{ id, name, active }],
  catalog: [{ id, name, type, groupIds, stock: { total, rotative } }] }`. É o formato da resposta,
  sem `goingCount`, `capacity`, `used` e `free`.

#### Regras da reserva (`POST /api/reserva` e `/desfazer`)

As duas rotas usam o mesmo usecase; só o status da resposta muda. Detalhe em
[`usecases/reservas.md`](../usecases/reservas.md).

| # | Regra |
|---|---|
| R1 | **Quem é a pessoa.** Com `hg_user`, vale a pessoa do cookie se o e-mail for o dela, ou o anonimizado com o `emailHash` certo. Senão, a busca é pelo e-mail (normalizado, em minúsculas). E-mail novo cria outra pessoa, e a rota grava o `hg_user` com ela. |
| R2 | **Nome trocado.** O mesmo e-mail com outro nome ou pronome atualiza a pessoa. Isso só é gravado depois das validações: uma reserva recusada não cria a pessoa nem troca o nome. |
| R3 | **Uma presença por pessoa e evento.** A presença existente é reaproveitada: mantém `id` e `createdAt`, e o resto muda. |
| R4 | **`vou`** exige reserva aberta. As contas usam as presenças das **outras** pessoas. Quem ainda não estava `vou` precisa de vaga no `totalVacancies`. |
| R5 | **`vou` com `groupId`:** grupo do evento e ativo; `supportIds` sem repetidos, só acessórios do evento que valem para o grupo (`groupIds` vazio = todos); instrumento, acessório e `capacity` com vaga. Quem já tem outro grupo recebe `ALREADY_RESERVED`. |
| R6 | **Só presença:** `groupId: null` e `supportIds: []`. Conta em `goingCount`, mas não ocupa instrumento. |
| R7 | **`nao-vou`:** grava a presença com `groupId: null`, mesmo com a reserva fechada. "Não vou" é uma presença gravada; "nem vi" é não ter presença. |
| R8 | **Quem usa o e-mail de outra pessoa** recebe o `hg_user` dela e passa a ver e desfazer a reserva dela. Fica assim até existir login por e-mail. |

#### Regras da Produção

| # | Regra |
|---|---|
| P1 | **Primeira vez.** Sem nenhum evento na base, o `GET /api/admin/ensaio` cria um a partir do `repos/supabase/mock/emptyState.json` (os grupos e o catálogo do Bloquinho). |
| P2 | **`PUT` com `null` = não enviou.** Um campo `null` mantém o valor gravado; um vazio (`""`) é aplicado. `id`, `stock.used` e os dados de integração vêm sempre do gravado. |
| P3 | O `PUT` recusa tirar um grupo ou item que alguma presença usa (400) e um `stock.total` abaixo das presenças do item (409), menos rotativo. |
| P4 | **Novo ensaio** grava um evento novo, que vira o atual. As presenças do anterior continuam ligadas a ele, como histórico. |
| P5 | Validação do evento (create e update): `location` não vazio, `date` `YYYY-MM-DD` ou vazia, horários `HH:mm`, `groupIds` do catálogo só com grupos do evento e no máximo um `INSTRUMENT` por grupo. |

#### Cookies

Todos são `HttpOnly; Secure; SameSite=Lax; Path=/`.

| Cookie | Valor | Validade | Uso |
|---|---|---|---|
| `hg_user` | id da pessoa | 1 ano | Quem é a pessoa. Gravado a cada reserva e lido em `minhas-reservas` e na reserva. Nome, pronome e presenças vêm do banco. |
| `hg_device` | UUID aleatório | 1 ano | O aparelho. Vai em `Attendance.metadata.deviceId`. Recriado se faltar ou não for UUID. |
| `hg_admin` | `<expira em ms>.<HMAC-SHA256 em base64>` | 12 h | Sessão da Produção. HMAC por WebCrypto com a `COOKIE_KEY`. |

**Login (`entrar`):** a chave é comparada pelo HMAC (o `verify` do WebCrypto, em tempo constante),
nunca com `===`. Chave vazia ou errada dá 401.

#### Logs

Uma linha JSON por registro (`lib/logger.ts`), com `scope` (o arquivo) e `context`.

| Onde | `context` | O que loga |
|---|---|---|
| usecases de `event/` | `Event` | `track` no início do `_execute`; `appError` no catch do `execute`, com `hormoniosEventId` quando a entrada traz |
| usecases de `booking/` | `User` ou `Attendance` | idem, com `hormoniosUserId` |
| `HormoniosRepository` | `HormoniosRepository` | `repositoryError` com a `operation` antes de lançar o `DatabaseError` |
| `handle` | — | `warn` com a `key` de todo `AppError` e `error` do resto (500) |

### Front — fase 1

#### Visão geral

- Os dados vêm do BFF (`/api/*`). Nada fica no `localStorage`.
- `api(path, { method, body })` faz o `fetch` com JSON e `credentials: "same-origin"`. Em erro,
  lança `{ status, key, message }`. Sem rede, a `key` é `NETWORK_ERROR`; um 200 que não é JSON
  (ex.: o Vite sem o `vercel dev`) vira `INVALID_RESPONSE`.
- Estado em memória (`state`): `event` (`GET /api/ensaio`), `user` (`GET /api/minhas-reservas`),
  `admin` (`GET /api/admin/ensaio`), os flags de carregando e erro e `email` (o último e-mail
  usado nesta aba, que não é salvo).
- `loadPublic` busca o ensaio e as minhas reservas juntos. Roda no `init` e depois de cada ação.
- Os cookies (`hg_user`, `hg_device`, `hg_admin`) são `HttpOnly`: o front não os lê.

#### Telas

A experiência é a do protótipo. As telas são views por hash: `#home`, `#presence`, `#instruments`,
`#my-reservations` e `#admin`.

| Tela | O que mostra |
|---|---|
| **Home, reservas fechadas** | Data, horário e local ("A definir" quando vazios); botão para as guias; link do WhatsApp só com `whatsappUrl`. A navegação de baixo fica escondida. |
| **Home, reservas abertas** | Data, horário, local e o contador `goingCount`. Botões "Confirmar presença", "Escolher instrumento" e guias. |
| **01 Presença** ("Quem vem tocar?") | O formulário `#presence-form` (e-mail, nome e pronome) e "Confirmar presença". A resposta aparece em `#presence-status`. Com reserva, mostra o `id` da pessoa (`#presence-user-id`) e preenche os campos vazios com o e-mail anonimizado, o nome e o pronome. |
| **02 Instrumentos** | Uma linha por grupo ativo que tem um `INSTRUMENT` no catálogo, com o `stock.free` dele ("disponível(is)"; sem número quando é `null`). Com 0, o botão vira "Esgotado" e fica `disabled`. |
| **03 Minhas reservas** | A presença `vou` da pessoa. Com instrumento: o nome do grupo e os acessórios ("Sem acessórios" quando não tem). Sem instrumento: "Presença confirmada". Cada linha tem "Desfazer". |
| **Folha (`#reserve-dialog`)** | "RESERVA / <instrumento>", e-mail, nome, pronome e um "Preciso de <acessório>" para cada `ACCESSORY` que vale para o grupo (`groupIds` vazio = todos); o esgotado vem `disabled` com "(esgotado)". |
| **Produção (`#admin`)** | Contadores (presenças e reservas ativas), abrir e fechar reservas, próximo ensaio (data, horário, local), link do WhatsApp, estoque com −/+, lista de presenças (nome, pronome e data) e "Encerrar ensaio e criar próximo". |
| **Login da Produção** | Campo "Senha". Abre pelo botão "Produção" e quando o BFF responde 401. |

| # | Regra |
|---|---|
| F1 | Com as reservas fechadas (`bookingOpen` diferente de `true`), `#presence`, `#instruments` e `#my-reservations` voltam para `#home`. |
| F2 | "Confirmar presença" com o mesmo e-mail, nome e pronome de uma presença `vou` não chama a API: mostra "Sua presença já está confirmada.". |
| F3 | Confirmar presença mantém o `groupId` e os `supportIds` da presença atual: só atualiza nome e pronome. |
| F4 | A folha confere antes de chamar a API "Você já reservou este instrumento." e "Este instrumento acabou de ficar esgotado." (`stock.free` 0 ou instrumento fora da lista). |
| F5 | A folha vem com o e-mail da pessoa (ou o da aba) e com o nome e o pronome dela. |
| F6 | Os acessórios marcados viram `supportIds`, e o `groupId` é o id do grupo. |
| F7 | A pessoa é reconhecida pelo `hg_user` e pelo `emailHash` (input hidden `#presence-email-hash`): a reserva manda o e-mail anonimizado junto com o hash. |
| F8 | **Desfazer instrumento** manda `answer: "vou"` com `groupId: null`: a pessoa continua com a presença. **Desfazer presença** (sem instrumento) manda `answer: "nao-vou"`. |
| F9 | Na Produção, as presenças são as `vou` de cada pessoa em `users`; "Reservas ativas" conta só as que têm grupo. |
| F10 | Estoque −/+: instrumentos primeiro, depois acessórios. Não passa de 0 nem fica abaixo de `stock.used`, a não ser que o item seja rotativo (aí o BFF decide). Item sem limite (`total` `null`) mostra "—" e "sem limite", com os botões `disabled`. Cada linha lista quem reservou ("nome — pronome") e o detalhe (os acessórios, no instrumento; o grupo, no acessório). |
| F11 | Toda alteração da Produção manda o evento inteiro (`eventBody`, o formato da resposta sem os campos calculados) com o que mudou por cima. |

#### Ação → rota

| Ação | Rota | Depois |
|---|---|---|
| Abrir a página | `GET /api/ensaio` + `GET /api/minhas-reservas` | renderiza tudo. O 404 de minhas reservas é "sem reserva", não erro. |
| Confirmar presença | `POST /api/reserva` com `answer: "vou"` | recarrega. `#presence-status`: "Presença confirmada. Agora você pode escolher um instrumento." |
| Reservar instrumento | `POST /api/reserva` com `groupId` e `supportIds` | fecha a folha, recarrega e vai para Minhas reservas. Toast "Instrumento reservado." |
| "Desfazer" | `POST /api/reserva/desfazer` | recarrega. Toast "Reserva desfeita. O instrumento voltou ao estoque." ou, sem instrumento, "Reserva desfeita." |
| Abrir a Produção | botão "Produção" → login; `#admin` → `GET /api/admin/ensaio` | renderiza a Produção; num 401, abre o login |
| Entrar | `POST /api/admin/entrar` `{ key }` | vai para `#admin`. Senha errada: toast "Senha incorreta." |
| Salvar ensaio | `PUT /api/admin/ensaio` com `date`, `startTime` e `location` | toast "Dados do ensaio atualizados." |
| Salvar link | `PUT /api/admin/ensaio` com `whatsappUrl` | toast "Link do grupo atualizado." |
| Abrir/fechar reservas | `PUT /api/admin/ensaio` com `bookingOpen` | ao fechar, vai para a home. Toasts "Reservas liberadas…" e "Reservas fechadas…" |
| Estoque − / + | `PUT /api/admin/ensaio` com o `catalog` e o `stock.total` novo do item | — |
| Encerrar ensaio | `POST /api/admin/novo-ensaio` (depois de um `confirm`) com o evento atual sem `id`, `bookingOpen: false`, `date` daqui a 7 dias e `startTime: null` | recarrega a Produção e vai para a home. Toast "Novo ensaio criado. Reservas estão fechadas." |

Toda ação da Produção renderiza com a `<produção>` da resposta e depois chama `loadPublic`.

#### Carregando e erro

| Situação | O que aparece |
|---|---|
| Ensaio carregando | "Carregando…" na home, nas listas e na Produção. A navegação de baixo fica escondida. |
| Ensaio ou minhas reservas com erro | "Não foi possível carregar o ensaio." (ou os instrumentos, ou suas reservas), com "Tentar de novo", que chama `loadPublic`. |
| Produção com erro (exceto 401) | "Não foi possível carregar a Produção." com "Tentar de novo". |
| Produção sem sessão | "Entre com a senha da Produção." com o botão "Entrar". |
| Ação em andamento | O botão fica `disabled` e com `aria-busy` até a resposta. |
| Ação com erro | Toast com a mensagem da `key` (tabela abaixo). |

#### Mensagem por `key`

| `key` | Toast | Além do toast |
|---|---|---|
| `SOLD_OUT_ERROR` | "Este instrumento acabou de esgotar." | fecha a folha e recarrega |
| `ACCESSORY_SOLD_OUT_ERROR` | "Este acessório acabou de esgotar." | fecha a folha e recarrega |
| `ALREADY_RESERVED_ERROR` | "Este e-mail já tem reserva neste ensaio." | — |
| `BOOKING_CLOSED_ERROR` | "As reservas estão fechadas no momento." | fecha a folha, recarrega e vai para a home |
| `STOCK_BELOW_RESERVATIONS_ERROR` | "O estoque total não pode ficar abaixo das reservas atuais." | — |
| `INVALID_PARAMETER_ERROR` | "Confira os campos." | — |
| `UNAUTHORIZED_ERROR` | sem toast | limpa a Produção e abre o login |
| outras (`NOT_FOUND_ERROR`, `INTERNAL_ERROR`, `NETWORK_ERROR`, `INVALID_RESPONSE`) | "Não foi possível concluir. Tente de novo." | — |

O `app.js` ainda tem mensagem para `EVENT_CHANGED_ERROR` e `EVENT_CREATION_PENDING_ERROR`, mas o
BFF não lança essas `key`.
