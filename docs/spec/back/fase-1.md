# Back — Fase 1: BFF com Supabase, sem login

> O que está implementado em `api/`, `src/serve-utils/` e `supabase/migrations/0001_fase1.sql`.
> Plano: [`bff-fase-1.md`](../../plans/bff-fase-1.md). Front: [`../front/fase-1.md`](../front/fase-1.md).
> Dúvidas em aberto: [`bff-fase-1-duvidas.md`](../../plans/bff-fase-1-duvidas.md).

## Visão geral

- Vercel Functions no próprio repo. Cada arquivo de `api/` é uma rota (lista fechada, 8 rotas).
- Handlers no formato Web (`GET(request: Request)`), sem `node:*`.
- O BFF é o único que acessa o Supabase, com a `service_role` (R10).
- Sem login. A pessoa se identifica por e-mail na folha. O aparelho, pelo cookie `hg_device`.

## Envs

| Env | Uso |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | chave `service_role` (só no servidor) |
| `ADMIN_KEY` | chave da Produção, digitada no login |
| `COOKIE_KEY` | segredo do HMAC que assina o `hg_admin` |

As envs são lidas na primeira chamada que precisa delas. Uma env ausente vira 500 `INTERNAL_ERROR`.

## Modelo (migration `0001_fase1.sql`)

| Tabela | Colunas | Observação |
|---|---|---|
| `hg_users` | `id` uuid, `email` text **unique**, `name`, `pronoun`, `data` jsonb `{}`, `created_at`, `updated_at` | e-mail em minúsculas e sem espaços (R15) |
| `hg_current_event` | `id` smallint (`check id = 1`), `data` jsonb, `updated_at` | uma linha só: o ensaio atual |
| `hg_attendances` | `id` uuid, `user_id` → `hg_users`, `day_key` text, `device_id` uuid, `data` jsonb, `created_at`, `updated_at` | `unique (user_id, day_key)`; índice em `(day_key, device_id)` |

- RLS ligada nas três, sem nenhuma política.
- A função `reservar` é `security definer`, com `execute` só para `service_role`.

**jsonb de `hg_current_event.data`:**

```
{ dayKey, date, time, location, bookingOpen, whatsappUrl,
  groups:   [{ id, name, stockTotal, active }],
  supports: [{ id, name }] }
```

**jsonb de `hg_attendances.data`:** `{ answer: "vou" | "nao-vou", groupId: string | null, supportIds: string[] }`.
`groupId` null é só presença, e aí `supportIds` é vazio.

**`dayKey`:** texto que identifica o ensaio. Na fase 1 é um UUID local, gerado no seed e a cada
novo ensaio. Na fase 2 passa a guardar `String(configDayId)` do Transicionais, sem mudar coluna. As
linhas de `hg_attendances` de ensaios antigos ficam com o `dayKey` antigo (histórico).

**Seed:** os 10 grupos do protótipo (caixa 6, tamborim 6, surdo-1/2/3 2 cada, agogô 4, repinique
3, timbal 2, alfaia 2, ganzá 5, todos ativos). Os `supports` são `talabarte` e `baqueta`
("Baqueta / maçaneta"). Data e hora vazias, local "A definir", WhatsApp vazio e `bookingOpen: true`
(dúvida 1).

## Erros

Todo erro é `{ key, message }` com o status abaixo.

| `key` | Status | Quando |
|---|---|---|
| `INVALID_PARAMETER_ERROR` | 400 | corpo não é objeto JSON; campo inválido; grupo inexistente ou inativo (`INVALID_GROUP` da função) |
| `UNAUTHORIZED_ERROR` | 401 | chave errada no login; `hg_admin` ausente, inválido ou vencido |
| `NOT_FOUND_ERROR` | 404 | ensaio atual não existe; reserva a desfazer não é deste aparelho ou do ensaio atual |
| `BOOKING_CLOSED_ERROR` | 409 | reservas fechadas |
| `SOLD_OUT_ERROR` | 409 | grupo sem vaga |
| `ALREADY_RESERVED_ERROR` | 409 | e-mail já tem reserva `vou` no ensaio |
| `EVENT_CHANGED_ERROR` | 409 | o `dayKey` mudou entre a leitura do ensaio e a função `reservar` (dúvida 19) |
| `STOCK_BELOW_RESERVATIONS_ERROR` | 409 | estoque novo menor que as reservas do grupo |
| `INTERNAL_ERROR` | 500 | qualquer outro erro (Supabase, env ausente) |

## Rotas

| Rota | Request | Response | `key` de erro |
|---|---|---|---|
| `GET /api/ensaio` | — | 200 `<ensaio>` | `NOT_FOUND`, `INTERNAL` |
| `POST /api/reserva` | `{ email, name, pronoun, groupId: string \| null, supportIds: string[] }` | 201 `{ id, groupId, supportIds, name, pronoun }` | `INVALID_PARAMETER`, `NOT_FOUND`, `BOOKING_CLOSED`, `EVENT_CHANGED`, `ALREADY_RESERVED`, `SOLD_OUT`, `INTERNAL` |
| `POST /api/reserva/desfazer` | `{ id }` (UUID) | 204 | `INVALID_PARAMETER`, `NOT_FOUND`, `INTERNAL` |
| `GET /api/minhas-reservas` | — | 200 `[{ id, groupId, groupName, supportIds, name, pronoun }]` | `NOT_FOUND`, `INTERNAL` |
| `POST /api/admin/entrar` | `{ key }` | 204 + `Set-Cookie: hg_admin` | `INVALID_PARAMETER`, `UNAUTHORIZED`, `INTERNAL` |
| `GET /api/admin/resumo` | — | 200 `<resumo>` | `UNAUTHORIZED`, `NOT_FOUND`, `INTERNAL` |
| `PUT /api/admin/ensaio` | parcial de `{ date, time, location, whatsappUrl, bookingOpen, groups: [{ id, stockTotal }] }` | 200 `<resumo>` | `UNAUTHORIZED`, `INVALID_PARAMETER`, `NOT_FOUND`, `STOCK_BELOW_RESERVATIONS`, `INTERNAL` |
| `POST /api/admin/novo-ensaio` | — | 200 `<resumo>` | `UNAUTHORIZED`, `NOT_FOUND`, `INTERNAL` |

(Na tabela, as `key` aparecem sem o sufixo `_ERROR`.)

**`<ensaio>`:** `{ dayKey, date, time, location, bookingOpen, whatsappUrl, goingCount, groups: [{ id, name, stockTotal, available }], supports: [{ id, name }] }`.
Só os grupos ativos.

**`<resumo>`:** `{ event, attendances: [{ id, name, pronoun, groupId, supportIds, createdAt }] }`.
`event` é igual ao `<ensaio>`, mas com todos os grupos e o campo `active`. `attendances` traz só
as linhas `vou`, por `created_at`.

### Regras das rotas

| # | Regra |
|---|---|
| RT1 | `available` = `stockTotal` − reservas `vou` do grupo, nunca abaixo de 0. `goingCount` = linhas `vou` do ensaio, com e sem instrumento. |
| RT2 | `reserva`, `desfazer` e `minhas-reservas` leem o `hg_device` e criam o cookie se ele faltar ou não for UUID. `GET /api/ensaio` não mexe no cookie. |
| RT3 | `minhas-reservas` devolve as linhas `vou` deste aparelho no `dayKey` atual. `groupName` é null quando é só presença. |
| RT4 | `admin/*`, menos `entrar`, chamam `requireAdmin` antes de tudo. |
| RT5 | `PUT /api/admin/ensaio` é parcial: só os campos enviados mudam. `location` e `whatsappUrl` passam por `trim`. `date` e `time` são texto livre (o front manda `YYYY-MM-DD` e `HH:MM`). |
| RT6 | No `PUT`, um `groups[].id` desconhecido dá 400. `stockTotal` é inteiro ≥ 0. Se algum grupo ficar com estoque menor que as reservas, dá 409 e nada é gravado. A conta é feita fora da trava (dúvida 7). |
| RT7 | `novo-ensaio`: gera um `dayKey` novo, com data e hora vazias, local "A definir" e `bookingOpen: false`. Mantém o WhatsApp, os grupos (com o estoque) e os acessórios. O resumo volta sem presenças. |
| RT8 | `desfazer` funciona com as reservas fechadas (dúvida 6). Só vale para uma linha do `dayKey` atual com o `device_id` deste aparelho; senão dá 404. Desfazer de novo uma linha já desfeita dá 204. |

## Regras de reserva

| # | Regra |
|---|---|
| RR1 | **Por e-mail.** Uma linha por e-mail (`user_id`) e por `dayKey`. O e-mail é normalizado: sem espaços e em minúsculas. |
| RR2 | **Nome trocado.** O mesmo e-mail com outro nome ou pronome sobrescreve `name` e `pronoun` em `hg_users` (upsert por e-mail). O upsert vem antes da função `reservar`. Com as reservas fechadas, o usecase recusa antes do upsert. Em `SOLD_OUT` e `ALREADY_RESERVED`, o nome já foi trocado (dúvida 9). |
| RR3 | **Só presença.** `groupId: null` e `supportIds: []` (com `supportIds` cheio, dá 400). Conta em `goingCount`, mas não usa vaga. |
| RR4 | **Instrumento.** `groupId` de um grupo ativo. `supportIds` precisa ser um id de `supports`, e os repetidos são removidos. |
| RR5 | **Presença que ganha instrumento.** Se o e-mail já tem presença `vou` sem grupo **neste aparelho**, um pedido com `groupId` atualiza essa linha. De outro aparelho, dá `ALREADY_RESERVED`. Pedir presença de novo também dá `ALREADY_RESERVED` (dúvida 8). |
| RR6 | **"Não vou".** A linha vira `{ answer: "nao-vou", groupId: null, supportIds: [] }` e a vaga volta. A linha continua existindo, com o mesmo `device_id`. |
| RR7 | **Reservar depois do "Não vou".** É permitido, de qualquer aparelho. A linha é reaproveitada (`on conflict`): `data` e `device_id` mudam e o `created_at` fica o mesmo (dúvida 18). |
| RR8 | **Último instrumento.** A conta das vagas e a gravação acontecem na função `reservar`, com trava na linha do ensaio. Dois pedidos ao mesmo tempo pela última vaga resultam numa reserva só. |

## Função `reservar(p_user_id, p_day_key, p_device_id, p_data)`

Devolve a linha gravada de `hg_attendances`. Os erros de negócio são `raise exception '<CÓDIGO>'`,
e o repo traduz a mensagem em `AppError`.

| Passo | O que faz | Erro |
|---|---|---|
| 1 | `select … from hg_current_event where id = 1 for update` (trava) | `EVENT_NOT_FOUND` (vira 500; na prática o usecase já deu 404 antes) |
| 2 | `bookingOpen` precisa ser `true` | `BOOKING_CLOSED` → `BOOKING_CLOSED_ERROR` |
| 3 | `p_day_key` precisa ser o `dayKey` atual | `EVENT_CHANGED` → `EVENT_CHANGED_ERROR` |
| 4 | com `groupId`: o grupo existe e está ativo | `INVALID_GROUP` → `INVALID_PARAMETER_ERROR` |
| 5 | linha do e-mail no dia com `answer = 'vou'` → recusa, exceto RR5 (mesmo aparelho, linha sem grupo, pedido com grupo) | `ALREADY_RESERVED` → `ALREADY_RESERVED_ERROR` |
| 6 | com `groupId`: reservas `vou` do grupo ≥ `stockTotal` | `SOLD_OUT` → `SOLD_OUT_ERROR` |
| 7 | `insert … on conflict (user_id, day_key) do update` de `data`, `device_id` e `updated_at`, com `answer: "vou"` | — |

O `dayKey` passado é o que o usecase leu do ensaio atual. O pedido do front não manda `dayKey`.

## Cookies

Os dois são `HttpOnly; Secure; SameSite=Lax; Path=/`.

| Cookie | Valor | Validade | Uso |
|---|---|---|---|
| `hg_device` | UUID aleatório | 1 ano | Diz quais reservas foram feitas neste aparelho ("Minhas reservas" e "Não vou"). Não identifica a pessoa. Substitui o `hg_participant_id` do `localStorage`. |
| `hg_admin` | `<expira em ms>.<HMAC-SHA256 em base64>` | 12 h | Sessão da Produção. O HMAC é por WebCrypto, com a `COOKIE_KEY`. `requireAdmin` confere a assinatura e a validade. |

**Login (`entrar`):** a chave é comparada pelo HMAC (o `verify` do WebCrypto, em tempo constante),
nunca com `===`. Chave vazia ou errada dá 401.

## O que falta confirmar no Supabase de dev

A onda 4 verificou tudo sem o Supabase real (PGlite e um dublê do PostgREST). Os pontos abertos
estão em [`bff-fase-1-duvidas.md`](../../plans/bff-fase-1-duvidas.md): a trava com dois pedidos ao
mesmo tempo, o rpc com `.single()`, o `hg_users(*)` embutido, o upsert com `on_conflict=email` e os
imports sem extensão no builder da Vercel.
