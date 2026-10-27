# Refactor do domain: usecases sobre o contrato novo

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
