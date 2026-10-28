# Refactor do domain — fase 2: sincronização com o Transicionais

> **Concluído em 2026-10-27.** Continuação de [`fase-1.md`](fase-1.md), onde estão as decisões, o repo,
> o domain, a ordem e a execução do refactor.

## Usecases

### Fase 3: sincronização

`Syncing*` envia (Supabase → Transicionais), em lote; `Receiving*` recebe (Transicionais →
Supabase), pelo webhook.

| Usecase | Entrada | Saída |
|---|---|---|
| `SyncingAttendanceUsecase` | `SyncJobRequest` | `SyncJobResult` |
| `SyncingUserUsecase` | `SyncJobRequest` | `SyncJobResult` |
| `SyncingEventUsecase` | `SyncJobRequest` | `SyncJobResult` |
| `ReceivingEventUsecase` | `transicionaisEventId?: number` | `WebhookResult` |
| `ReceivingUserUsecase` | `transicionaisUserId: number` | `WebhookResult` |
| `ReceivingAttendanceUsecase` | `attendanceId: number` | `WebhookResult` |
| `ReceivingUsecase` | `WebhookPayload` | `WebhookResult` |

O `ReceivingUsecase` mapeia o `entityId` para o usecase do cenário: `user` → `ReceivingUser`,
`event` → `ReceivingEvent`, `validation` → `ReceivingAttendance`.

```ts
WebhookPayload {
  entityId: "user" | "event" | "validation";
  lastUpdate: string; // ISO; mais velho que o syncedAt gravado = ignorado (D10)
  requestId?: string; // uuid, idempotência; WIP, não é gravado
  body: { resourceId: number | string };
}

WebhookResult { success: boolean; manualRetry: boolean }

SyncJobRequest {
  limit: number; // máximo 50
  target: "ATTENDANCE" | "USER" | "EVENT";
  status: "PENDING" | "SYNCED" | "MANUAL_RETRY";
}

SyncJobResult { total: number; success: number; rejected: number; pending: number; manualRetry: number }
```

## Como ficou (2026-10-27)

### Back — fase 2

#### Visão geral

- A base do Hormônios (Supabase) é a fonte das telas. O Transicionais é sincronizado nos dois
  sentidos, sem que a tela espere por ele:
  - **Envio (Supabase → Transicionais):** logo depois de gravar, o usecase tenta enviar. A falha
    vai para a fila `integration_status`, e o job reenvia.
  - **Recebimento (Transicionais → Supabase):** o Transicionais avisa pelo webhook, e o BFF busca o
    dado lá e grava aqui.
- Para quem reserva e para a Produção, o Transicionais é transparente: as rotas e as respostas da
  fase 1 não mudam.
- Só `version` e `syncHash` dizem se um dado do Transicionais mudou. As datas de lá não servem para
  isso.

#### Envs

| Env | Uso |
|---|---|
| `TRANSICIONAIS_URL` | base da API do Transicionais |
| `TRANSICIONAIS_USER` / `TRANSICIONAIS_PASSWORD` | conta de membro do BFF (login) |
| `TRANSICIONAIS_ORG_ID` | organização do Bloquinho nas URLs e no `emailHash` |
| `WEBHOOK_API_KEY` | valor do header `api-key` do webhook |
| `CRON_SECRET` | `Authorization: Bearer <CRON_SECRET>` do job |

#### Estado de integração (no metadata de `Event`, `User` e `Attendance`)

| Campo | Significado |
|---|---|
| `integrationId` | id no Transicionais: o id do encontro (`Event`), o `userId` da conta (`User`) ou o `validationId` (`Attendance`). `null` = ainda não integrado |
| `sync` | `PENDING`, `SYNCED`, `REJECTED` ou `MANUAL_RETRY` |
| `syncError` | a `key` (ou a mensagem) do último erro de envio |
| `syncHash` | o `hash` do Transicionais na última leitura |
| `syncedAt` | ISO do último envio ou leitura com sucesso |
| `version` | `version` do Transicionais na última leitura |

O `Event` também guarda `externalPublicId` (o link público), `transicionaisDayId` (o dia do
encontro) e `fetchedAt` (a última leitura). O `User` guarda a conta inteira em `account`
(`profileId` do membro ou `profileGuestId` do convidado).

#### Sessão e falhas do Transicionais

| # | Regra |
|---|---|
| T1 | Toda chamada autenticada passa pela `TransicionaisSession`: login com a conta de membro, refresh e um reenvio depois de um 401. Usecase e rota nunca veem token. |
| T2 | Timeout de 3 s por chamada (`HttpClient`). |
| T3 | **Fora do ar** = sem resposta (rede, timeout), 429 ou 5xx → `UpstreamUnavailableError` (503 `UPSTREAM_UNAVAILABLE_ERROR`). |
| T4 | Uma `key` conhecida do Transicionais vira o `AppError` do Hormônios (`TRANSICIONAIS_ERRORS`: estoque abaixo das reservas, encontro ou assistência não encontrados). `EVENT_VERSION_CONFLICT` vira `VersionConflictError`. |
| T5 | Qualquer outra recusa vira `UpstreamBadContractError` (400, 409, 422) ou `UpstreamResponseError`, com o erro como veio, para gravar no `errorCtx`. |
| T6 | O repo loga toda falha antes de lançar (`repositoryError`, `context: TransicionaisRepository`). |
| T7 | A presença lida (Supabase ou webhook) com `groupId` ou `supportIds` fora do evento vira `InvalidCacheStateError` (422 `INVALID_CACHE_STATE_ERROR`, E9), e não 500. O front mostra "Não foi possível concluir. Tente de novo." (a `key` não tem mensagem própria no `app.js`). |
| T8 | O token da conta de membro é campo da `TransicionaisSession`. Como a session é singleton pelo `Envolviment`, o login vale para os pedidos seguintes da mesma instância. |

#### Envio (Supabase → Transicionais)

| Entidade | Quem envia | Quando | Chamada |
|---|---|---|---|
| `Event` | `CreatingInternalEventUsecase` (e o job) | `integrationId` `null` e `sync` diferente de `SYNCED` e `MANUAL_RETRY` | cria o encontro e grava, nesta ordem, a categoria, os grupos, a publicação, o dia e cada item do catálogo (assistência); depois lê o encontro de volta |
| `User` | `CreatingOrUpdateUserUsecase` (e o job) | `sync` diferente de `SYNCED` e `MANUAL_RETRY` | `POST manager-organization/users`, idempotente pelo e-mail; devolve a conta |
| `Attendance` | `CreatingOrUpdatingAttendanceUsecase` (e o job) | `sync` diferente de `SYNCED` e `MANUAL_RETRY` | `POST manager-validations/change` com a conta da pessoa e o `transicionaisDayId` do evento |

| # | Regra |
|---|---|
| E1 | O envio não derruba a rota: o Supabase já gravou. Só uma falha do próprio Supabase sobe. |
| E2 | Sucesso → `sync: SYNCED` no metadata (com o que o Transicionais devolveu: o `integrationId` do encontro, a conta da pessoa) e na fila. |
| E3 | Fora do ar → `PENDING`, `tentatives + 1` e `nextSyncAt` daqui a 1, 5, 15 e depois 60 min. Na 10ª tentativa (`MAX_INTEGRATION_TENTATIVES`), vira `MANUAL_RETRY`. |
| E4 | Qualquer outro erro → `MANUAL_RETRY`, com log. As `key` de domínio já foram conferidas antes, então é erro de integração. |
| E5 | O `syncError` é a `key` do erro ou, sem ela, a mensagem. |
| E6 | Sem como enviar ainda: evento sem data, ou presença de pessoa sem `account` ou de evento sem `transicionaisDayId` → `PENDING` com backoff, sem chamar o Transicionais. |
| E7 | A reserva grava a pessoa como `PENDING`, então toda reserva reenvia o cadastro (que é idempotente). |

##### Fila `integration_status` (`v2__create_integration_status.sql`)

Uma linha por `(entity, entityId)`, com `entity` `EVENT`, `USER` ou `ATTENDANCE` e `entityId` o
uuid do Hormônios. Colunas: `status` (`SyncStatus`), `syncAt` (a última tentativa), `tentatives`,
`nextSyncAt` (`null` = não espera) e `errorCtx` (jsonb `{ statusCode, error, key, message }`, o
erro do Transicionais como veio). RLS ligada, sem políticas. O backoff é regra do domain
(`IntegrationStatus.pending`), não do banco.

#### Job (`GET /api/cron/sync?type=event|user|attendance`)

| # | Regra |
|---|---|
| J1 | `requireCron` na primeira linha. `type` fora da lista → 400. |
| J2 | O `JobUsecase` escolhe o usecase pelo `type`: `EventJobUsecase`, `UserJobUsecase` ou `AttendanceJobUsecase`. |
| J3 | Cada um lê da fila os itens da sua entidade com `status: PENDING` e `nextSyncAt` vencido ou `null`, do `syncAt` mais antigo para o mais novo, até `MAX_ITEMS_PER_JOB` (30). |
| J4 | Os itens rodam em paralelo (`Promise.all`), cada um com o seu `try/catch`: a falha de um não para os outros. Para cada item, busca o registro no Supabase e envia como em **Envio**. |
| J5 | Registro que não existe mais no Supabase → a fila vai para `MANUAL_RETRY` ("not found") e o item sai da resposta. |
| J6 | Evento que já tem `integrationId` → só marca a fila como `SYNCED`, sem criar de novo. |
| J7 | Resposta: a lista dos registros processados pelo `toJson()`, **com** o `metadata` (`sync` e `syncError` mostram o resultado de cada um). Só o cron chama essa rota. |

`yarn cron:sync --type=event|user|attendance [BFF_URL]` chama a rota como o agendador.

#### Webhook (`POST /api/webhooks/transicionais`)

| # | Regra |
|---|---|
| W1 | `requireWebhookKey` na primeira linha: o header `api-key` é comparado com o `WEBHOOK_API_KEY` pelo SHA-256, em tempo constante. |
| W2 | Corpo: `{ entity, requestId?, sendAt, body: { eventId?, userId?, validationId? } }`. O campo do `body` é obrigatório conforme a `entity`. Corpo inválido → 400. |
| W3 | `entity` → usecase: `event` → `EventWebhookUsecase`, `user` → `UserWebhookUsecase`, `validation` → `AttendanceWebhookUsecase`. Outra `entity` → `REJECTED`. |
| W4 | Resposta: `{ status: SyncStatus, accept: boolean }`. Não existe no Transicionais → `{ REJECTED, false }`; Transicionais fora do ar → `{ PENDING, false }`; gravado ou já igual → `{ SYNCED, true }`. |
| W5 | **Evento:** acha pelo `integrationId`. Não existe → cria; existe → atualiza só se o `syncHash` mudou **e** a `version` não é menor que a gravada. O webhook não mexe em `whatsappUrl` nem em `bookingOpen` (só do Hormônios): evento criado por ele fica com a reserva fechada até a Produção abrir. |
| W6 | **Pessoa:** acha pelo `integrationId` ou, sem ele, pelo e-mail. Não existe e veio sem e-mail → `REJECTED`. Existe → só vincula (`integrationId` e `account`); nome, e-mail e pronome ficam os do Hormônios. |
| W7 | **Presença:** acha o evento pelo `transicionaisDayId` (sem evento → `REJECTED`), a pessoa (ou a cria) e a presença pelo `integrationId` ou pela pessoa. Grava direto no repo quando é nova ou o `syncHash` mudou, sem as validações da reserva: o Transicionais já validou. Dos acessórios, ficam só os do evento. |
| W8 | O `requestId` e o `sendAt` são validados, mas não usados: ainda não há idempotência. |

`yarn cron:webhook --entity=event|user|validation --id=<id>` chama a rota como o Transicionais.

#### Leitura do Transicionais

| O quê | Chamadas | Vira |
|---|---|---|
| Evento | id numérico → `manager-events/details/{id}` para achar o link público; depois o GET público (ou direto, com o uuid) | `Event` sem `id`, com `whatsappUrl` e `bookingOpen` `null`, `sync: SYNCED` e os ids, `version`, `syncHash` e `fetchedAt`. O dia é o `configDayId` da publicação; o catálogo, o `summary.supports` desse dia, e `stock.used` = `members + guests + occupied` |
| Pessoa | `manager-organization/users/{userId}?by=userId`; se for convidado, `manager-validations/guests?profileGuestId=` | `User` com `integrationId` = `userId` e a conta em `account`. Membro vem sem nome nem e-mail |
| Presença | `manager-validations/guests?validationId=` | `User` com a `Attendance`: `ATTENDING` é `vou`; `DECLINED` e `TENTATIVE` são `nao-vou`, sem grupo nem catálogo |

#### Logs

| Onde | `context` |
|---|---|
| usecases de `sync/` (webhook) | `Sync`: `track` no início (e o resultado do evento: criado, atualizado, já processado, não achado) e `appError` no catch |
| usecases de `job/` | `Job`: `track` no início, `appError` no catch e `error` por item que falhou ou foi recusado, com o `hormonios*Id` |
| `TransicionaisRepo` | `TransicionaisRepository`: `repositoryError` com a `operation` antes de lançar |

#### Montagem das rotas (`Envolviment`)

| # | Regra |
|---|---|
| V1 | A rota pede o usecase por `Envolviment.make<Tipo>(<Usecase>.token)` (estático), numa variável com o nome do usecase. Ela não monta client, session nem repo. |
| V2 | **Singleton lazy por instância** (função da Vercel, isolate da Cloudflare): o 1º `make` de um token monta o usecase e as dependências que faltam (`HttpClient`, `SupabaseClient`, `TransicionaisSession`, repos) e guarda; os seguintes devolvem a instância. O SDK do Supabase nasce uma vez por instância, na 1ª consulta. |
| V3 | Token sem `case` no `make` → `Error` de configuração (500). Os 8 usecases pedidos por rota têm `token`; `CreatingOrUpdateUserUsecase` e `FindingUserUsecase` são montados dentro do `CreatingOrUpdatingAttendanceUsecase`. |

#### Limites conhecidos

- O agendador do job fica fora deste repo: ele só precisa chamar a rota com o `CRON_SECRET`.
- A fila só guarda o envio. O que chega pelo webhook não passa por ela.
- O webhook chega com o id do Transicionais. O `track` dele sai sem `hormonios*Id` até achar o
  registro.

### Front — fase 2

#### Visão geral

O Transicionais é transparente para o front: as telas, as rotas e os textos são os da fase 1. O
envio e o recebimento acontecem no BFF, e o front não espera por eles nem mostra o estado do
envio. Só muda o que segue.

| # | Regra |
|---|---|
| F12 | **Presença recusada não conta.** A presença com `sync: "REJECTED"` (o Transicionais recusou) é ignorada em Minhas reservas, na folha ("Você já reservou este instrumento.") e nas presenças e reservas da Produção. A pessoa pode reservar de novo. |
| F13 | **Código do evento em debug.** Só com `?debug=1` na URL, a home (abertas e fechadas) e o título "PRÓXIMO ENSAIO" da Produção mostram `E-<id>-<integrationId>`. Evento ainda não enviado mostra `NÃO_INTEGRADO` no lugar do `integrationId`. Fora do debug, o código fica escondido. |
| F14 | **Evento criado pelo Transicionais** chega com a reserva fechada (`bookingOpen` `null`) e sem link do WhatsApp, até a Produção definir os dois. A home mostra o estado de reservas fechadas. |
