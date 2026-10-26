# bff-hormonios — Fase 2: integração com a API do Transicionais e plano de falha

> Índice e decisões comuns: [`README.md`](README.md). Execução: [`bff-fase-2-implementacao.md`](bff-fase-2-implementacao.md).
> Setup do Hormônios no Transicionais: [`transicionais/setup-hormonios.md`](transicionais/setup-hormonios.md). Recursos do Transicionais: Fase 2 de [`transicionais/plano-transicionais.md`](transicionais/plano-transicionais.md).

## Objetivo

- O ensaio, os instrumentos (grupos) e as vagas passam a vir do Transicionais.
- As reservas **vão para o Transicionais** como ingressos de convidado, identificadas pelo **e-mail**
  e enviadas pelo BFF com o **token JWT de serviço** (`role: SERVICE`), no padrão de auth do Transicionais. Não depende de login.
- Se o Transicionais cair, o Hormônios segue com o último retrato, continua aceitando reservas e
  envia quando ele voltar, sem duplicar.

## Decisões

| # | Decisão | Origem |
|---|---|---|
| R2 | Com o Transicionais no ar, ele é a verdade e a base local é cache. Fora do ar, a base local é a verdade até a sincronização. | conversa |
| R4 | O IP real vem do header que a Vercel repassa e vai para o back em toda chamada (T2.4). | conversa |
| R18 | **Sincronização pelo serviço:** o BFF envia a reserva com o e-mail, o nome e o pronome da pessoa, com o token JWT de serviço (`role: SERVICE`, T2.4) na rota de serviço (T2.5). O back acha ou cria o convidado pelo e-mail na organização. Não usa token de pessoa. | conversa |
| R5 | A sincronização tem **status**: `PENDING`, `SYNCED`, `REJECTED`. | conversa |
| R8 | Idempotência no Transicionais: o ingresso é único por pessoa e dia, e repetir a mesma resposta não cria passo. O BFF sempre envia o **estado atual** da linha. | conversa (o id único já existe) |
| R9 | Idempotência no Hormônios: uma linha por pessoa e dia (`unique (user_id, day_key)`). | conversa |
| R11 | **Webhook `event.updated`:** o retrato inteiro do encontro público, trocado de uma vez e só se for mais novo. | conversa |
| R12 | **Webhook `validation.changed`:** atualiza a reserva da pessoa (pelo `orderId` ou pelo e-mail) e as vagas do dia. | conversa |
| R13 | **O encontro atual vem da configuração** (~~`CURRENT_EVENT`~~ revisto pela E2.7: vem da listagem da API), e uma rotina só a resolve: `refreshCurrentEvent()`. Ela roda quando a API precisa e num cron. | conversa |
| R14 | **Os crons são disparados por um Cloudflare Worker** (plano gratuito), que chama as rotas `/api/cron/*` do BFF. A lógica fica no BFF. | conversa |
| ~~E2.1~~ | **Substituída pela E2.5 (2026-10-24).** ~~A **Produção do Hormônios passa a ser só leitura** para ensaio, instrumentos e vagas, que agora se editam no painel do Transicionais. O link do WhatsApp continua sendo do Hormônios.~~ | — |
| E2.5 | **A complexidade do Transicionais é transparente para o Hormônios.** A Produção mantém a mesma tela. Salvar ensaio, estoque e abrir/fechar reservas são repassados pelo BFF às rotas `manager-events/*`. "Encerrar ensaio" cria o próximo encontro no Transicionais (mesmos grupos, assistências e limites), e ele passa a ser o atual. O link do WhatsApp continua do Hormônios. | Bea, 2026-10-24 |
| E2.6 | **Até existir a role `SERVICE` (T2.4), o BFF entra como membro** pelo `POST auth/login`, com `TRANSICIONAIS_USER`/`TRANSICIONAIS_PASSWORD` (ADMIN da organização). Token e refresh ficam na memória da função; num 401, renova e, se não der, entra de novo. | Bea, 2026-10-24 |
| E2.7 | **O encontro atual vem da API, sem env.** É o primeiro encontro Público da listagem de manager (`GET v2/manager-events/details?startAt=<hoje>&orderBy=startAt:asc`), que já traz os grupos; o completo vem de `GET v2/manager-events/details/{id}`. Os ids de grupos e assistências são os do Transicionais (sem de-para). "Encerrar ensaio" cria o próximo e apaga o antigo, e a listagem passa a achar o novo. O `CURRENT_EVENT` saiu. Revê a R13. | Bea, 2026-10-24 |
| E2.8 | **A reserva vai com o token de membro**, que também escreve como convidado: `POST v2/community/validations/change` com `person: { email, name, pronoun }` e `idempotencyKey` (setup, item 6). Substitui a rota de serviço da T2.5 até ela existir. | Bea, 2026-10-24 |
| E2.8 (revista) | **O envio vai pelas rotas de manager**, com o token de membro: cadastra a pessoa como convidado (`POST v2/manager-organization/users`, idempotente pelo e-mail) e responde em nome dela (`POST v2/manager-validations/change` com `profileGuestId`, ou `profileId` se for membro). Sem `person` e sem `idempotencyKey`. Substitui a rota de community. Detalhes na D41. | Bea, 2026-10-25 |
| E2.9 | **O estoque é o `capacity` das assistências (`manager-support-types`), não a vaga do grupo.** O instrumento é a assistência `type='instrumento'`, ligada ao grupo pelo `groupIds` dela. Os acessórios são as `type='acessorio'` que valem para o grupo do instrumento (`groupIds` com o grupo ou vazio = todos). O ocupado é o `confirmed` de `configDays[].summary.supports` do dia (revisto na D47: antes `occupied`). `rotativo: true` pode passar da capacidade; sem rotativo, a reserva é recusada (instrumento e acessório). `public.vacancies` (pessoas por grupo) não aparece no front. A Produção ajusta o `capacity` (`PUT manager-support-types/{id}`, objeto inteiro). Continuam as duas leituras: a listagem de manager só acha o encontro (`externalId`, `configDayId`); grupos, local, assistências e estoque vêm do GET público. Revê a D17. Contrato: [`transicionais/public-event-exemplo.json`](transicionais/public-event-exemplo.json). | Bea, 2026-10-25 |
| E2.3 | **O Transicionais é invisível para quem reserva.** A tela nunca cita o Transicionais. Não há aceite de termos dele nem login. O BFF traduz a `key` de erro do back numa mensagem do Hormônios (vaga esgotada, prazo encerrado, reservas fechadas). | conversa |
| E2.4 | **E-mail de membro responde como membro.** O serviço do Transicionais faz o roteamento (T2.5). Para o BFF não muda nada: a resposta volta com o `orderId` do mesmo jeito, e as regras do membro valem (escala, VAL-01 a VAL-07). Se o membro não estiver escalado, o back recusa e a reserva fica `REJECTED` (E2.3). | conversa |
| E2.2 | **Migração da fase 1:** os instrumentos locais são ligados aos grupos do Transicionais pelo nome (tabela de-para na migration). As reservas da fase 1 trocam `day_key` pelo `configDayId` e entram como `PENDING`. | padrão adotado |

## Em aberto

| # | Pergunta | Recomendação |
|---|---|---|
| B6 | `validation.changed` de alguém que não está em `hg_users` (membro, ou convidado que respondeu pelo Transicionais). | Não criar pessoa local. Só as vagas. |

## Modelo (migration 2)

```sql
alter table hg_current_event
  add column external_id text,
  add column version int,                    -- EventFull.version do Transicionais
  add column vacancies_at timestamptz,       -- quando as vagas do retrato foram calculadas
  add column fetched_at timestamptz;         -- última leitura do Transicionais

alter table hg_users
  add column transicionais_guest_id text unique;   -- devolvido pela rota de serviço

alter table hg_attendances
  add column transicionais_sync text not null default 'PENDING'
    check (transicionais_sync in ('PENDING','SYNCED','REJECTED')),
  add column transicionais_order_id text unique,
  add column transicionais_changed_at timestamptz,
  add column sync_error text,
  add column attempts int not null default 0,
  add column next_attempt_at timestamptz not null default now();

create table hg_webhook_deliveries (
  delivery_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
```

## `refreshCurrentEvent()` (R13)

A configuração (env `CURRENT_EVENT`, `{ customId, externalId, dayId }`) diz qual é o encontro atual.

> **Revisto pela E2.7:** não há mais `CURRENT_EVENT`. O encontro atual é o primeiro Público da
> listagem de manager com data de hoje em diante. O `external_id` gravado serve só para a trava.

1. Chama `GET v2/community/organizations/{customId}/events/{externalId}?dayId=` (timeout de 3 s). É a rota pública.
2. Grava em `hg_current_event`, com uma trava:
   - **outro `externalId`** (a configuração mudou): troca a linha inteira;
   - **mesmo `externalId`:** troca só se a `version` for maior, ou se for igual e as vagas forem mais novas;
   - **sem mudança:** não grava. Rodar duas vezes dá no mesmo.
3. Se a chamada falhar, não mexe no retrato.

| Quem chama | Quando |
|---|---|
| `GET /api/ensaio` | retrato vazio, de outro `externalId` ou com mais de 5 min |
| Worker → `GET /api/cron/event` | a cada 5 min. Pega webhook perdido e troca de configuração |
| Webhook `event.updated` | não chama a rotina; grava o retrato recebido com a mesma trava, só se o `externalId` for o da configuração |

## Escrita da reserva

Toda escrita grava **primeiro** em `hg_attendances` (upsert por `user_id, day_key`, com
`transicionais_sync = 'PENDING'` e `updated_at = now()`). Depois tenta enviar na hora pela rota de
serviço (T2.5):

| Situação | O que acontece |
|---|---|
| Transicionais no ar | Envia na hora. Aceitou: `SYNCED`. Recusou: `REJECTED` e a mensagem do Hormônios para o motivo (E2.3). |
| Transicionais fora ou lento (> 3 s) | Fica `PENDING`. A tela diz "reserva registrada; confirmamos assim que possível". O cron envia depois. |

As regras da fase 1 continuam: id do aparelho, e-mail já usado e último instrumento. As vagas
mostradas são as do retrato menos as reservas locais `PENDING`.

## Cron de sincronização

Worker, a cada minuto, chamando `GET /api/cron/sync`.

1. `claim_pending(n)` (função SQL): pega até N linhas `PENDING` com `next_attempt_at <= now()`, com `for update skip locked`, e adia o `next_attempt_at` delas. Duas execuções nunca pegam a mesma linha.
2. Envia o **estado atual** pela rota de serviço, com e-mail, nome, pronome, `configDayId`, resposta, grupo e assistências, e o id da linha como chave de idempotência.
3. Trata a resposta:

| Resposta do back | Linha |
|---|---|
| 2xx | `SYNCED`, `transicionais_order_id`, `transicionais_changed_at` e `hg_users.transicionais_guest_id`, **só se `updated_at` não mudou** durante o envio. Se mudou, continua `PENDING`. |
| 409 `VALIDATION_ANSWER_CHANGED` (VAL-19) | `PENDING`, tenta no próximo ciclo |
| 409 de vaga esgotada ou prazo (`…_FULL`, `…_ANSWER_CLOSED`, `…_NOT_OPEN`) | `REJECTED` + `sync_error` |
| 400/404/422 de regra (incluindo membro não escalado, E2.4) | `REJECTED` + `sync_error` |
| 401/403 do token de serviço | Renova o token uma vez e reenvia. Se continuar, `PENDING` e alerta no log. É configuração, não culpa da pessoa. |
| 5xx, rede, timeout | `PENDING`, `attempts + 1`, volta na próxima chamada do cron (revisto na D46: antes, espera crescente de 1, 2, 4… até 30 min) |

Não duplica: uma linha por pessoa e dia no Hormônios (R9), um ingresso por pessoa e dia no
Transicionais (R8) e a chave de idempotência da rota de serviço.

## Plano de falha

| Falha | Comportamento |
|---|---|
| Transicionais fora ou lento (> 3 s) | `GET /api/ensaio` responde o último retrato com `stale: true` e `fetchedAt`. A tela mostra "informações podem estar desatualizadas". |
| Transicionais fora e nenhum retrato guardado | A fase 1 deixou a linha de `hg_current_event` com o ensaio local, então sempre existe um retrato. |
| Reserva com o Transicionais fora | Fica `PENDING` contra as vagas do retrato. O cron envia quando ele voltar. |
| Vaga tomada por outra pessoa enquanto o Transicionais estava fora | O envio volta 409 e a reserva fica `REJECTED`, com o motivo na tela (E2.3). |
| Webhook perdido | O cron de 5 min corrige o retrato. A resposta de cada envio corrige a reserva. |
| Webhook repetido ou fora de ordem | `deliveryId` e as travas (`version`, `changedAt`): não muda nada. |
| Vercel fora | O Worker tenta no próximo disparo. O Transicionais reenvia os webhooks por até 24 h. |

## Webhooks (contrato que o Transicionais vai emitir)

**Entrega (vale para os dois tipos):**
- `POST /api/webhooks/transicionais`, com o corpo em JSON.
- `Authorization: Bearer <JWT>` emitido pelo Transicionais no padrão existente (`role: SERVICE`, `aud: hormonios`, validade curta). O BFF confere a assinatura, o `aud` e a validade. Token inválido, vencido ou de outro `aud` → 401.
- Envelope: `{ deliveryId, type, occurredAt, organizationId, data }`.
- **Deduplicação:** `insert into hg_webhook_deliveries … on conflict do nothing`. Se o id já existe, responde 200 sem processar.
- Responde 2xx rápido. O Transicionais reenvia com espera crescente por até 24 h.

**`event.updated`:**

```json
{
  "type": "event.updated",
  "data": {
    "externalId": "…",
    "version": 12,
    "current": true,
    "event": { "...": "o mesmo retrato do GET público: dias, grupos, vagas, assistências, prazo, local" },
    "vacanciesAt": "2026-10-23T18:00:00Z"
  }
}
```

- Um único `upsert` na linha `id = 1`, com o retrato inteiro, nunca a diferença.
- Mesma trava do `refreshCurrentEvent()`. Se for o mesmo ou mais velho, responde 200 sem mudar nada.
- `externalId` diferente do da configuração: ignora e responde 200.
- Encontro pausado ou encerrado vem como retrato. A tela mostra "reservas fechadas".

**`validation.changed`:**

```json
{
  "type": "validation.changed",
  "data": {
    "orderId": "…",
    "configDayId": 345,
    "person": { "kind": "GUEST", "guestId": "…", "email": "…" },
    "answer": "ATTENDING",
    "status": "VALIDATED",
    "groupId": "…",
    "supportTypeIds": ["…"],
    "changedAt": "2026-10-23T18:01:02Z",
    "dayVacancies": { "total": 3, "groups": [{ "groupId": "…", "remaining": 1 }] }
  }
}
```

Como o BFF aplica:

1. Acha a linha por `transicionais_order_id`. Se não achar, acha a pessoa por `transicionais_guest_id` ou pelo e-mail, e a linha pelo dia.
2. **Trava:** aplica só se `changedAt > transicionais_changed_at`.
3. **Mudança local mais nova:** a linha está `PENDING` com `updated_at > changedAt`. Mantém o local, e o cron envia.
4. Fora isso, grava `data`, `transicionais_order_id`, `transicionais_changed_at` e `SYNCED`.
5. Pessoa fora de `hg_users` (B6): só as vagas.
6. Sempre: atualiza as vagas do retrato com `dayVacancies`, se for mais novo que `vacancies_at`.

## Agendador (R14)

```toml
# cron/wrangler.toml
name = "hormonios-cron"
main = "worker.js"
[triggers]
crons = ["* * * * *", "*/5 * * * *"]
```

```js
// cron/worker.js
export default {
  async scheduled(event, env, ctx) {
    const path = event.cron === "* * * * *" ? "/api/cron/sync" : "/api/cron/event";
    ctx.waitUntil(fetch(env.BFF_URL + path, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    }));
  },
};
```

- `BFF_URL` e `CRON_SECRET` são secrets do Worker (`wrangler secret put`). O `CRON_SECRET` é o mesmo da Vercel. As rotas recusam sem `Authorization: Bearer <CRON_SECRET>` (401).
- Um Worker por ambiente.
- Limites do plano gratuito: conferir na página de limites dos Workers. O uso é pequeno.
- Se as rotas rodarem no runtime **Edge** da Vercel: acesso ao Supabase pelo `supabase-js`, travas em funções SQL (RPC) e criptografia por WebCrypto/`jose`.

## Tasks

**E2-S1. Migration 2 e de-para** (E2.2) ✅ `0002`–`0004`. Sem de-para por nome: as reservas com instrumento viram só presença (D15).

**E2-S2. Cliente do Transicionais**
- [x] Token JWT de serviço (`role: SERVICE`) no `Authorization: Bearer` de toda chamada, obtido e renovado no padrão do Transicionais (T2.4), e o IP real (R4). Feito com o token de membro (E2.6) até existir a role `SERVICE`.
- [x] Timeout de 3 s.

**E2-S3. `refreshCurrentEvent()`**
- [x] Rotina com a trava. `GET /api/ensaio` passa a usá-la e devolve `stale`.
- [x] Rota `GET /api/cron/event`.
- [ ] Testes: rodar duas vezes não grava; trocar a configuração troca o retrato; versão mais velha não sobrescreve; Transicionais fora devolve `stale`.

**E2-S4. Envio das reservas**
- [x] Escrita local primeiro e envio na hora (as duas situações).
- [x] `claim_pending(n)` e rota `GET /api/cron/sync` com a tabela de respostas e a trava do `updated_at`.
- [ ] "Minhas reservas" mostra o status: confirmada, pendente ou recusada (com o motivo). O BFF já devolve `sync` e `syncError`; falta o front (onda 4).
- [ ] Testes: envio repetido não duplica; mudança durante o envio continua `PENDING`; 409 vira `REJECTED`; queda vira `PENDING` com espera.

**E2-S5. Webhooks**
- [x] Rota, validação do JWT e deduplicação.
- [x] `event.updated` com a trava. `validation.changed` com a trava de `changedAt`, a mudança local mais nova e as vagas (só por assistência, D36).
- [ ] Testes: entrega repetida, fora de ordem, token inválido ou vencido, versão igual, mudança local mais nova que o webhook.

**E2-S6. Worker** (`cron/`, os dois triggers, secrets, um por ambiente)

**E2-S7. Produção pelo Transicionais** (E2.5) ✅. Mesma tela; o BFF repassa as edições e o "Encerrar ensaio" cria o próximo encontro. O link do WhatsApp continua local.

**E2-W1. Front:** aviso de `stale` e status da reserva.

**Envs novas:** `TRANSICIONAIS_URL` (com `/apps_nodejs`), `TRANSICIONAIS_USER`, `TRANSICIONAIS_PASSWORD` (E2.6), `TRANSICIONAIS_ORG_ID` (rota pública, D14), `CRON_SECRET`, `TRANSICIONAIS_JWT_KEY` (para conferir o JWT dos webhooks).

**Pronto quando:**
1. Uma reserva feita no Hormônios aparece na lista de convidados do painel do Transicionais, com grupo, assistências e pronome.
2. Com o back parado, uma reserva fica pendente. Ao religar, o cron confirma, sem duplicar, nem depois de reenviar a mesma linha à mão.
3. Mudar o local do encontro no painel aparece no Hormônios em segundos (webhook) ou em até 5 min (cron).
4. Uma presença marcada pela porta aparece em "Minhas reservas".
5. Reenviar o mesmo webhook não muda nada.

**Depende de:** o setup [`transicionais/setup-hormonios.md`](transicionais/setup-hormonios.md) (escrita como convidado pelo token de membro, pronome e webhooks). A T2.4/T2.5 de `transicionais/plano-transicionais.md` substituem a E2.6/E2.8 quando existirem.
