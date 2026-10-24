# bff-hormonios — Fase 1: Hormônios sozinho (sem a API do Transicionais)

> Índice e decisões comuns: [`README.md`](README.md). **Implementado:** [`../spec/back/fase-1.md`](../spec/back/fase-1.md) e [`../spec/front/fase-1.md`](../spec/front/fase-1.md). Recursos do Transicionais: [`transicionais/plano-transicionais.md`](transicionais/plano-transicionais.md).


## Objetivo

Trocar o `localStorage` por uma base compartilhada entre aparelhos. Tudo que o protótipo faz hoje
continua igual: presença, instrumento, talabarte/baqueta, Produção abrindo e fechando reservas. A
diferença é que os dados ficam no Supabase.

## Decisões

| # | Decisão |
|---|---|
| E1.1 | **Sem login.** A pessoa informa e-mail, nome e pronome na folha da reserva. |
| E1.2 | **Id do aparelho** num cookie `hg_device` (`httpOnly`, aleatório, 1 ano). Não identifica a pessoa. Ele só diz quais reservas foram feitas neste aparelho, para "Minhas reservas" e "Desfazer". Substitui o `hg_participant_id` do `localStorage`. |
| E1.3 | **E-mail já usado:** se a pessoa não tem reserva no dia, cria a reserva normalmente, ligada a este aparelho. Se já tem, recusa com "este e-mail já tem reserva neste ensaio". Ninguém desfaz uma reserva feita em outro aparelho. |
| E1.4 | **Produção protegida por uma chave** (`ADMIN_KEY` na env), no lugar da senha `garoa` escrita no `app.js`. A chave vira um cookie `hg_admin` assinado, de 12 h. |
| E1.5 | **Presença e instrumento viram uma folha só**, como vai ser no Transicionais ("vou" + grupo). |
| E1.6 | **Último instrumento:** a reserva conta as vagas e grava numa função SQL só (`reservar(...)`), com trava na linha do ensaio. Assim, dois pedidos ao mesmo tempo não levam a mesma última vaga. |

## Modelo (migration 1)

```sql
create table hg_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,               -- minúsculas, sem espaços (R15)
  name text not null,
  pronoun text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hg_current_event (
  id smallint primary key check (id = 1),   -- uma linha só
  data jsonb not null,                      -- { date, time, location, bookingOpen, whatsappUrl,
                                            --   groups: [{ id, name, stockTotal, active }],
                                            --   supports: [{ id, name }] }
  updated_at timestamptz not null default now()
);

create table hg_attendances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references hg_users(id),
  day_key text not null,                    -- fase 1: id local do ensaio; fase 2: configDayId
  device_id uuid not null,                  -- E1.2
  data jsonb not null,                      -- { answer, groupId, supportIds }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_key)
);
```

Na implementação, o jsonb de `hg_current_event` ganhou o `dayKey` (texto), que vai para `day_key`.
O seed usa data e hora vazias (ver `bff-fase-1-duvidas.md`, dúvida 1).

## Rotas do BFF

| Rota | Faz |
|---|---|
| `GET /api/ensaio` | Ensaio, instrumentos com as vagas (estoque menos as reservas "vou") e se as reservas estão abertas |
| `POST /api/reserva` | Folha: e-mail, nome, pronome, instrumento, talabarte/baqueta. Upsert de `hg_users` por e-mail e `reservar(...)` (E1.3, E1.6) |
| `POST /api/reserva/desfazer` | "Não vou", só para reserva deste aparelho |
| `GET /api/minhas-reservas` | Reservas deste aparelho |
| `POST /api/admin/entrar` | Confere a `ADMIN_KEY` e grava `hg_admin` |
| `GET /api/admin/resumo` | Presenças, reservas por instrumento, acessórios |
| `PUT /api/admin/ensaio` | Data, hora, local, link do WhatsApp, abrir e fechar reservas, estoque |
| `POST /api/admin/novo-ensaio` | Encerra o ensaio atual e cria o próximo fechado (o "Encerrar ensaio" de hoje) |

## Tasks

**E1-S1. Esqueleto e Supabase**
- [x] Vercel Functions no próprio repo. Rotas em lista fechada.
- [x] Migration 1 (`supabase/migrations/0001_fase1.sql`) com RLS ligada sem política pública.
- [ ] Projeto Supabase de dev criado e migration aplicada (`supabase link` e `db push`).
- [x] Função SQL `reservar(user_id, day_key, device_id, data)`: trava a linha de `hg_current_event`, confere estoque e reservas abertas, faz o upsert. A trava com dois pedidos ao mesmo tempo ainda precisa do teste no Supabase de dev (ver `bff-fase-1-duvidas.md`).
- [x] Envs lidas no código: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_KEY`, `COOKIE_KEY`.
- [ ] Envs preenchidas na Vercel e no `.env.local`.

**E1-S2. Rotas públicas** (ensaio, reserva, desfazer, minhas reservas, `hg_device`)
- [x] As 4 rotas e o cookie `hg_device`. O "Não vou" funciona com as reservas fechadas e o nome é trocado antes da função `reservar` (ver `bff-fase-1-duvidas.md`, dúvidas 6, 8 e 9).

**E1-S3. Rotas da Produção** (`hg_admin`, resumo, ensaio, estoque, novo ensaio)
- [x] As 4 rotas e o cookie `hg_admin`. O estoque é conferido fora da trava (ver `bff-fase-1-duvidas.md`, dúvida 7).

**E1-W1. Front**
- [x] Saem as chaves do `localStorage` e o estoque semeado no `app.js` (passa para a migration como dado inicial).
- [x] Folha única de reserva com e-mail, nome e pronome.
- [x] Produção usa as rotas `/api/admin/*`. Sai a senha `garoa`.
- [x] Estados de carregando e de erro.

**Pronto quando:** dois celulares veem as mesmas vagas. Duas pessoas disputando o último instrumento
resultam numa reserva só. Desfazer de outro aparelho não funciona. A Produção fecha as reservas e o
público vê a tela de "reservas fechadas". Estes critérios dependem do Supabase de dev e do
`vercel dev` (ver `bff-fase-1-duvidas.md`).
