# Implementação da fase 2 do bff-hormonios

> Plano de execução de [`bff-fase-2.md`](bff-fase-2.md). Feito com a Bea em 2026-10-24.
> **Status (2026-10-25):** ondas 1 (docs), 2 (leitura e Produção) e 3 (reservas, cron e webhooks)
> feitas, e a E2.9 (estoque pelas assistências) também. Faltam a 4 (front e Worker) e a 5
> (verificação). A 6 (specs) virou contínua: a skill `code-pattern` exige a spec e o doc de usecase
> junto com o código ([`spec/back/fase-2.md`](../spec/back/fase-2.md), [`spec/front/fase-2.md`](../spec/front/fase-2.md)).
> Dúvidas: [`bff-fase-2-duvidas.md`](bff-fase-2-duvidas.md).

## Contexto

A fase 1 deixou o BFF com o Supabase, e o ensaio é editado localmente. A fase 2 liga o Hormônios
à API do Transicionais e acrescenta o plano de falha (cache, `stale`, `PENDING`, crons e
webhooks).

**Decisões da Bea (2026-10-24)**, já registradas em `bff-fase-2.md`:

- **E2.5. A complexidade do Transicionais é transparente para o Hormônios.** A Produção mantém a
  mesma tela e os mesmos textos. Cada ação dela é repassada pelo BFF para a API do Transicionais.
  "Encerrar ensaio" cria o próximo encontro lá automaticamente, e ele passa a ser o atual. A E2.1
  ("Produção só leitura") saiu.
- **E2.6. Auth por login de membro, até existir a role `SERVICE`.** O BFF entra pelo
  `POST auth/login` com `TRANSICIONAIS_USER` e `TRANSICIONAIS_PASSWORD`.
- **E2.7. O encontro atual vem da API, sem env:** o primeiro encontro Público da listagem de
  manager com data de hoje em diante. Os ids de grupos e assistências são os do Transicionais.
- **E2.8. A reserva vai com o token de membro**, que também escreve como convidado:
  `POST v2/community/validations/change` com a pessoa no corpo (setup, item 6).
- **Setup do Transicionais:** [`transicionais/setup-hormonios.md`](transicionais/setup-hormonios.md).
  O dev do Transicionais é resetado sempre; o setup recria a organização, os grupos, as
  assistências e o encontro.

**O que o contrato publicado (`docs/transicionais-api.json`) ainda não tem:** a escrita como
convidado pelo token de membro (setup, item 6), o pronome e os webhooks. O código segue o formato
do setup e de `bff-fase-2.md`. A onda 3 confere a escrita numa chamada real à API de dev, quando
houver `.env.local`. O que divergir vai para as dúvidas.

**Sem testes automatizados no repo** (como na fase 1): `npm run typecheck` e a verificação da
onda 5.

## Envs

| Env | Uso |
|---|---|
| `TRANSICIONAIS_URL` | base da API, **com** o prefixo `/apps_nodejs` (`http://localhost:4500/apps_nodejs` ou `https://dev-api.transicionais.com.br/apps_nodejs`). A url-collection não repete o prefixo. |
| `TRANSICIONAIS_USER`, `TRANSICIONAIS_PASSWORD` | login do membro ADMIN do BFF (`hormonios-bff` do setup; antes do setup, `admin1` de [`transicionais-dev-users.md`](../agent_docs/backend/transicionais-dev-users.md)) |
| `CRON_SECRET` | `Authorization: Bearer` das rotas `/api/cron/*` (o mesmo no Worker) |
| `TRANSICIONAIS_JWT_KEY` | chave para conferir o JWT dos webhooks |

## Tradução Hormônios ↔ Transicionais (só no repo `repos/transicionais/`)

| Hormônios | Transicionais |
|---|---|
| `dayKey` | `String(configDayId)` do dia atual |
| `date` / `time` | `configDays[].current` (`YYYY-MM-DD`) / `configDays[].startTime` (`HH:mm`) |
| `location` | `location` do encontro |
| `bookingOpen` | `public.answerWindow.open && !public.answerWindow.closed` (a escrita é dúvida D1) |
| `groups[].id` | `String(groupId)` do Transicionais (sem de-para) |
| `groups[].name` | `groups[].name` |
| `groups[].stockTotal` | `public.vacancies.groups[].total` |
| `groups[].active` | o grupo está nos grupos esperados do encontro |
| `supports[].id` | `String(id)` da assistência no Transicionais. O front deixa de fixar `talabarte`/`baqueta` (Passo C). |
| `whatsappUrl` | **só do Hormônios**, em `hg_current_event.data` |
| `answer: "vou"` / `"nao-vou"` | `status: ATTENDING` / `DECLINED` |

A ordem dos grupos é a do retrato (o setup cria na ordem da tela).

## Contrato da API (fixo antes dos subagentes)

Igual ao da fase 1 ([`bff-fase-1-implementacao.md`](bff-fase-1-implementacao.md)), com estas
mudanças. Toda resposta é JSON. O erro é sempre `{ key, message }`.

```ts
// GET /api/ensaio: ganha stale e fetchedAt
{ dayKey, date, time, location, bookingOpen, whatsappUrl, goingCount,
  groups: [{ id, name, stockTotal, available }], supports: [{ id, name }],
  stale: boolean,              // true = o Transicionais não respondeu e é o último retrato
  fetchedAt: string | null }   // ISO da última leitura do Transicionais

// POST /api/reserva: mesmo corpo. A resposta ganha sync
// → 201 { id, groupId, supportIds, name, pronoun, sync: "PENDING" | "SYNCED" }
// Se o Transicionais recusar na hora: a linha fica REJECTED, e a rota responde o erro
// traduzido (SOLD_OUT_ERROR, BOOKING_CLOSED_ERROR ou RESERVATION_REJECTED_ERROR).

// POST /api/reserva/desfazer: igual (204). Grava local e envia DECLINED.

// GET /api/minhas-reservas: as linhas "vou" deste aparelho, inclusive as REJECTED
// → [{ id, groupId, groupName, supportIds, name, pronoun,
//      sync: "PENDING" | "SYNCED" | "REJECTED",
//      syncError: string | null }]   // key do Hormônios (SOLD_OUT_ERROR…), só quando REJECTED

// GET /api/admin/resumo: igual; attendances ganham sync
// PUT /api/admin/ensaio: mesmo corpo e resposta. whatsappUrl grava local; o resto vai para o
//   Transicionais. Transicionais fora → 503 UPSTREAM_UNAVAILABLE_ERROR, nada é gravado.
// POST /api/admin/novo-ensaio: mesma resposta. Cria o próximo encontro no Transicionais (E2.5).

// GET /api/cron/event   Authorization: Bearer <CRON_SECRET>  → 200 { changed: boolean }
// GET /api/cron/sync    Authorization: Bearer <CRON_SECRET>  → 200 { claimed, synced, rejected, pending }
// POST /api/webhooks/transicionais   Authorization: Bearer <JWT>  → 204
```

**Keys novas:** `RESERVATION_REJECTED_ERROR` 409 (o Transicionais recusou por outra regra),
`UPSTREAM_UNAVAILABLE_ERROR` 503 (o Transicionais não respondeu numa ação da Produção). O
`UNAUTHORIZED_ERROR` 401 vale também para cron e webhook.

**Tradução das keys do Transicionais** (envio da reserva):

| Transicionais | Hormônios | Linha |
|---|---|---|
| `VALIDATION_GUEST_GROUP_FULL`, `…_EVENT_FULL`, `…_FREE_SEATS_FULL` | `SOLD_OUT_ERROR` | `REJECTED` |
| `VALIDATION_GUEST_ANSWER_CLOSED`, `…_ANSWER_NOT_OPEN`, `VALIDATION_DAY_INACTIVE` | `BOOKING_CLOSED_ERROR` | `REJECTED` |
| `VALIDATION_ANSWER_CHANGED` (409) | — | `PENDING`, próximo ciclo |
| outro 400/404/409/422 | `RESERVATION_REJECTED_ERROR` | `REJECTED` |
| 401/403 | — | renova o token uma vez e reenvia; se continuar, `PENDING` e `console.error` |
| 429, 5xx, rede, timeout | — | `PENDING`, `attempts + 1`, espera 1, 2, 4… até 30 min |

**Regras locais que mudam:**
- Uma linha `REJECTED` não ocupa vaga e não conta como reserva: a pessoa pode reservar de novo (a
  função `reservar` trata `REJECTED` como `nao-vou`).
- Vagas mostradas (`available`) = `stockTotal` do retrato − `vou` do grupo **no retrato** (`total −
  free`) − linhas `vou` locais `PENDING` do grupo. Nunca abaixo de 0. Com o retrato local da fase 1
  (sem `external_id`), a conta é a da fase 1.
- O `SOLD_OUT` local (função `reservar`) usa a mesma conta, para não aceitar `PENDING` além do
  retrato.

## Ondas (um subagente por vez, com a revisão do tech lead entre elas)

| Onda | Quem | O que entrega | Arquivos dele |
|---|---|---|---|
| 1 | **tech lead** ✅ | Docs: este plano, `bff-fase-2.md` (E2.5–E2.8), dúvidas, `.env.example`, `agent_docs/backend` (`http.md`, `clients.md`, `repos.md`, `README.md`), setup do Transicionais | `docs/**`, `.env.example` |
| 2 | **back A** | Passo A | `supabase/**`, `src/serve-utils/**`, `api/**` |
| 3 | **back B** | Passo B | `supabase/**`, `src/serve-utils/**`, `api/**` |
| 4 | **front + worker** | Passo C | `cron/**`, `app.js`, `index.html`, `styles.css` |
| 5 | **verificação** | Passo D. Só relata falhas, com a saída dos comandos | nenhum |
| 6 | **specs** | Passo E | `docs/spec/**`, `docs/plans/bff-fase-2.md` |

### Passo A — leitura do Transicionais e Produção (onda 2)

1. **Migration `supabase/migrations/0002_fase2.sql`:** a de `bff-fase-2.md` (colunas de
   `hg_current_event`, `hg_users`, `hg_attendances` e `hg_webhook_deliveries`, com RLS ligada e sem
   política). Mais:
   - função `migrar_fase1(p_old_day_key, p_new_day_key, p_group_map jsonb)`: troca `day_key` e
     `data.groupId` (pelo de-para) das linhas do ensaio local e marca `PENDING` (E2.2). `security
     definer`, `execute` só para `service_role`;
   - `reservar` passa a tratar `REJECTED` como `nao-vou` e a usar a conta de vagas acima (o retrato
     traz o ocupado por grupo em `data.groups[].taken`, gravado pelo repo).
2. **`clients/http-client.ts`** (padrão de `clients.md`): `request<T>({ method, url, body, headers })`,
   timeout de 3 s.
3. **`repos/transicionais/`**: `url-collection.ts`, `session.ts` (token de membro, `repos.md`) e
   `repo.ts` com: `findPublicEvent({ customId, externalId, dayId })`, `updateEvent(...)` (local,
   data, hora, limites, abertura; lê a `version` antes e tenta de novo uma vez em
   `EVENT_VERSION_CONFLICT`) e `createNextEvent(...)` (cria o encontro, o dia, os grupos e o
   público, copiando grupos, assistências e limites do atual). Os `IRaw*` em
   `interfaces/transicionais.ts`. Mapper pela tabela de tradução.
4. **`usecases/refresh-current-event.ts`** (`refreshCurrentEvent()`, R13 revista): acha o encontro
   atual pela listagem de manager (E2.7) e lê o completo. Grava com a trava (`version`, depois
   `vacanciesAt`). Na primeira leitura sobre o retrato local da fase 1, chama `migrar_fase1` (as
   reservas com instrumento viram só presença: os ids locais não existem no Transicionais). Mantém o `whatsappUrl` local.
5. **`GET /api/ensaio`**: chama a rotina quando o retrato é local, de outro `externalId` ou tem
   mais de 5 min. Falhou → último retrato com `stale: true`.
6. **`GET /api/cron/event`**: `requireCron` + rotina.
7. **`PUT /api/admin/ensaio`** e **`POST /api/admin/novo-ensaio`** pelo repo do Transicionais e
   depois a rotina, para gravar o retrato novo. `novo-ensaio` grava o novo `external_id`/`dayKey`
   no Supabase (E2.7).

### Passo B — reservas, cron e webhooks (onda 3)

1. **`ITransicionaisRepo.sendAttendance(...)`** → `POST v2/community/validations/change`, com o
   token de membro e o corpo do setup, item 6 (`idempotencyKey` = id da linha + `updated_at`).
   Devolve `{ guestId, orderId, changedAt }` ou o erro traduzido. Manda o `X-Forwarded-For` com o
   IP real (`clientIp`, `http.md`); no cron, sem IP.
2. **`ReserveUsecase` e `CancelReservationUsecase`**: grava local primeiro (`PENDING`), tenta enviar
   na hora e aplica a tabela de respostas. Fora ou lento: responde 201/204 com `PENDING`.
3. **Função `claim_pending(n)`** (`for update skip locked`, adia `next_attempt_at`) e
   **`GET /api/cron/sync`**: envia o estado atual de cada linha e grava `SYNCED` só se o
   `updated_at` não mudou durante o envio (função SQL `marcar_sync(...)` com essa trava).
4. **`GET /api/minhas-reservas`**: `sync` e `syncError`.
5. **`POST /api/webhooks/transicionais`**: `verifyWebhookJwt` (`http.md`), deduplicação em
   `hg_webhook_deliveries`, `event.updated` com a trava do retrato e `validation.changed` com a
   trava de `changedAt` e da mudança local mais nova. B6: pessoa fora de `hg_users` atualiza só as
   vagas.

### Passo C — front e Worker (onda 4)

**Manter a UX do protótipo: só o novo muda.** A Produção continua igual.

- `cron/wrangler.toml` e `cron/worker.js`, como em `bff-fase-2.md`, e um `cron/README.md` curto
  (secrets e um Worker por ambiente).
- **Assistências pelos ids da API:** as duas caixas da folha (talabarte e baqueta) passam a ser
  montadas a partir de `event.supports`, com o mesmo visual e os mesmos textos. Saem as constantes
  `STRAP`/`BEATER`.
- `stale: true` → aviso "Informações podem estar desatualizadas." no topo da home. Sem `stale`,
  nada muda.
- "Minhas reservas": `PENDING` mostra "Pendente: confirmamos assim que possível."; `REJECTED`
  mostra "Recusada" com a mensagem da `syncError` (as que já existem por `key`). `SYNCED` fica como
  hoje.
- Depois de reservar com `sync: "PENDING"`, o toast é "Reserva registrada; confirmamos assim que
  possível.". Com `SYNCED`, o toast de hoje.
- `UPSTREAM_UNAVAILABLE_ERROR` na Produção: toast "Não foi possível salvar agora. Tente de novo em
  instantes.".

### Passo D — verificação (onda 5)

1. `npm run typecheck`.
2. Fakes, como na fase 1 (PGlite para as migrations 1 e 2, dublê do PostgREST e um dublê do
   Transicionais): a trava do retrato (duas vezes não grava; versão mais velha não sobrescreve;
   outra configuração troca); `stale`; envio repetido não duplica; mudança durante o envio
   continua `PENDING`; 409 de vaga vira `REJECTED`; queda vira `PENDING` com espera; `claim_pending`
   em paralelo não pega a mesma linha; webhook repetido, fora de ordem, JWT inválido ou vencido;
   cron sem `CRON_SECRET` → 401; `migrar_fase1`.
3. Se o `.env.local` tiver as envs do Transicionais: chamadas reais à API de dev (login,
   `GET` público, `refreshCurrentEvent`, salvar ensaio, "Encerrar ensaio" e uma reserva).

### Passo E — specs (onda 6)

`docs/spec/back/fase-2.md` e `docs/spec/front/fase-2.md`, no formato da fase 1, a linha no
changelog dos dois `README.md` e as tasks marcadas em `bff-fase-2.md`.

## Regras para todos os subagentes

- O back segue o `CLAUDE.md` e a tabela **Por tarefa** de `docs/agent_docs/backend/README.md`. O
  contrato do Transicionais é lido **só pelo script** da skill `code-pattern`.
- Escopo de arquivos fechado. Ninguém commita nem roda o build: o subagente roda só
  `npm run typecheck`.
- Uma dúvida que os docs não resolvem e que não bloqueia vai para
  [`bff-fase-2-duvidas.md`](bff-fase-2-duvidas.md), com o que foi feito para seguir. Bloqueou: para
  e relata.
- Ninguém espera o Supabase, o `.env.local` ou o setup do Transicionais para seguir.
- Uma falha da verificação volta ao subagente que fez a parte.

**Ao fim de cada onda, o tech lead:** revisa o diff, **pergunta à Bea antes de rodar o
`yarn build`** (regra da skill `code-pattern`) e commita a onda.

**Antes da onda 5, a Bea faz:** rodar o setup no Transicionais, preencher o `.env.local` e rodar
`! npx supabase db push`.
