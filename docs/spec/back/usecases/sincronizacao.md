# Sincronização

> Atualizado em 2026-10-26 (refactor do domain, [`create-domain.md`](../../../plans/create-domain.md)).
> `Syncing*` envia (Supabase → Transicionais) e ainda não existe; o webhook recebe
> (Transicionais → Supabase).

## WebhookUsecase — `POST /api/webhooks/transicionais`

> [`usecases/sync/WebhookUsecase.ts`](../../../../src/serve-utils/usecases/sync/WebhookUsecase.ts)

**Contexto.** O Transicionais avisa que uma entidade mudou. A rota confere o header `api-key` com
o `WEBHOOK_API_KEY` (`requireWebhookKey`, em tempo constante) e passa o corpo.

**Decisão.**
- Corpo: `{ entity, requestId?, sendAt, body: { eventId } }`. O `eventId` é o id numérico do
  encontro no Transicionais ou o uuid do link público. Corpo inválido → 400.
- Monta o `Webhook` (domain: `id` e `entity`) e chama o usecase da entidade: `event` →
  `EventWebhookUsecase` (U11).
- Outra `entity` → `{ status: REJECTED, accept: false }`.
- Responde `WebhookResult.toJson()`: `{ status: SyncStatus, accept: boolean }`.

**Consequências.**
- O `requestId` e o `sendAt` são validados, mas não usados: sem idempotência por enquanto.
- O `scripts/cron.mjs --type=webhook --entity=event --id=<1|uuid>` (`yarn cron:webhook`) chama a
  rota como o Transicionais.

## EventWebhookUsecase — sem rota (chamado pelo `WebhookUsecase`)

> [`usecases/sync/EventWebhookUsecase.ts`](../../../../src/serve-utils/usecases/sync/EventWebhookUsecase.ts)

**Contexto.** Traz para a base um evento que mudou no Transicionais.

**Decisão.**
- Busca o evento no repo do Transicionais (`findEvent`): id numérico → `manager-events/details/{id}`
  para achar o `public.id`, depois o GET público; uuid → direto no GET público. O repo devolve o
  `Event` (o `PublicEventResponse` traduz) sem `id` e com `whatsappUrl` e `bookingOpen` `null` (não enviou, são só do Hormônios), com `sync: SYNCED`,
  `integrationId`, `transicionaisDayId`, `externalPublicId`, `version`, `syncHash` (o `hash` da
  resposta), `syncedAt` (o `public.updatedAt`) e `fetchedAt` (a hora do get). O `stock.used` de cada
  item do catálogo é `members + guests + occupied` do `summary.supports` do dia.
- Não existe no Transicionais (404, ou encontro sem link público) → `{ status: REJECTED,
  accept: false }`.
- Transicionais fora do ar (`UpstreamUnavailableError`) → `{ status: PENDING, accept: false }`.
- Acha o evento na base pelo `integrationId` (`findEventByIntegrationId`, D7):
  - não existe → `CreatingInternalEventUsecase` com o `Event` do Transicionais;
  - existe → `UpdatingInternalEventUsecase` só se o `hash` mudou **e** o `version` não é menor
    que o `metadata.version` gravado (sem `version` gravado, atualiza). Só o `hash` e o `version`
    são confiáveis: as datas do Transicionais (ex.: `public.updatedAt`) não mudam com o catálogo do
    dia;
  - nos dois casos, e quando não precisa atualizar → `{ status: SYNCED, accept: true }`.

**Consequências.**
- O `Event` passa direto aos usecases internos ([`producao.md`](producao.md)), que completam o
  `id`, o `stock.used` e os campos `null` (`whatsappUrl`, `bookingOpen`) com o gravado.
- O dia do evento é o `public.vacancies.configDayId` (ou o primeiro dos `configDays`); o catálogo
  é o `summary.supports` desse dia (a fonte da verdade), só os ativos com `type` conhecido, com os `groupIds` filtrados
  para os grupos do evento.
- Um erro de validação dos usecases internos (ex.: tirar um grupo com presença) sai como 400 para
  o Transicionais.

## Envio (Supabase → Transicionais)

**Contexto.** `CreatingInternalEventUsecase`, `CreatingOrUpdateUserUsecase` e
`CreatingOrUpdatingAttendanceUsecase` tentam enviar logo depois de gravar, num `private sync`.

**Decisão.**
- **Fila:** tabela `integration_status` (`domain/IntegrationStatus.ts`; migration
  `v2__create_integration_status.sql`), uma linha por `(entity, entityId)`: `status`, `syncAt` (a
  última tentativa), `tentatives`, `nextSyncAt` e `errorCtx` (o erro do Transicionais como veio).
- Sucesso → `SYNCED` no metadata e na fila.
- `UpstreamUnavailableError` (5xx, rede, 429) → `PENDING`, `tentatives + 1` e `nextSyncAt` em 1, 5,
  15 e depois 60 min. Em `MAX_INTEGRATION_TENTATIVES` (10), vira `MANUAL_RETRY`.
- Qualquer outro erro (4xx: as keys de domínio já foram conferidas antes, então é erro de
  integração) → `MANUAL_RETRY`, com log e o `syncError` (a key ou a mensagem) no metadata.
- O sync não derruba a rota: o Supabase já gravou. Só uma falha do próprio Supabase sobe.
- Sem função de banco: o backoff e a regra ficam no domain (`IntegrationStatus.pending`).

**Consequências.**
- Ainda não há cron que releia a fila (`nextSyncAt` vencido, `status` ≠ `SYNCED`/`MANUAL_RETRY`,
  até `MAX_ITEMS_PER_JOB` = 30): fica para outro plano.
