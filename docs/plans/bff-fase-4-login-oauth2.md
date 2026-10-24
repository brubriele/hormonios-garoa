# bff-hormonios — Fase 4 (opcional): Login etapa 2 (SSO com OAuth2)

> Índice e decisões comuns: [`README.md`](README.md). Recursos do Transicionais: [`transicionais/plano-oauth2.md`](transicionais/plano-oauth2.md) (fluxo e contrato da volta) e Fase 4 de [`transicionais/plano-transicionais.md`](transicionais/plano-transicionais.md).

## Objetivo

Na folha de reserva, ao lado de "Entrar com e-mail" (fase 3, se existir), entram os botões **Continuar com
Google** e **Continuar com LinkedIn**. A pessoa vê duas telas: a folha e o provedor. Ela volta com a
reserva feita e cai no **mesmo cadastro** criado pela rota de serviço da fase 2.

## Pré-requisito

A fase 2 está entregue: `hg_users`, sincronização e webhooks. A fase 3 não é necessária. Sem ela,
a migration desta fase cria o que falta: `hg_users.email_verified_at` (`add column if not exists`).

## O que o Hormônios usa do Transicionais

Só referência. O que precisa ser criado está em `transicionais/`.

| Recurso | Onde está definido |
|---|---|
| `POST /api/oauth/{provider}` do bf-front aceitando `returnTo` + `state` + `pronoun` | T4.1; contrato em `plano-oauth2.md` ("Ida") |
| Volta por POST automático com JWE (`handoff`) ou `error` + `state` | T4.2; contrato em `plano-oauth2.md` ("Volta") |
| Ligação da conta do provedor com o cadastro do mesmo e-mail verificado | T4.3 |
| Pré-reserva sem login (`holdToken`) para o BFF | decisão A1 de `plano-oauth2.md` |
| Env compartilhada `OAUTH_HANDOFF_KEY_HORMONIOS` | `plano-oauth2.md` |

## Rotas do BFF

| Rota | Faz |
|---|---|
| `POST /api/oauth/{provider}` | Valida a folha (nome, pronome, grupo, aceite), cria a pré-reserva, grava o cookie `hg_oauth` e responde a página que posta o formulário para o bf-front (`Cache-Control: no-store`). Sem vaga (409): volta à folha com a mensagem do back. |
| `POST /api/oauth/return` | Decifra o `handoff`, confere `aud`, `exp` e `state`, e apaga o `hg_oauth`. Liga ou cria `hg_users` pelo e-mail verificado, preenche `email_verified_at` e grava `hg_session`. Grava a reserva e confirma com `holdId` + `X-Hold-Token`. |

## Cookie

| Cookie | Opções | Conteúdo |
|---|---|---|
| `hg_oauth` | `httpOnly`, `Secure`, **`SameSite=None`** (a volta é um POST de outro site), `path=/api/oauth`, 10 min, cifrado | state, holdId, holdToken, groupId, supportTypeIds |

## Tasks

**E4-S1. Ida: `POST /api/oauth/{provider}`**

**E4-S2. Volta: `POST /api/oauth/return`**
- [ ] Reserva confirmada na hora fica `SYNCED`. Se o back cair nesse instante, fica `PENDING` e o cron envia.
- [ ] Pré-reserva vencida (404): tenta sem ela. Vaga acabou (409): mensagem "esgotou".
- [ ] `error` na volta (incluindo `MEMBER_NOT_SUPPORTED`): mensagem na folha.
- [ ] Testes: `handoff` repetido, vencido ou com outro `state` é recusado.

**E4-W1. Front:** botões do provedor como `<form method="post" action="/api/oauth/{provider}">`, ao lado de "Entrar com e-mail".

**Envs novas:** `BF_FRONT_URL`, `OAUTH_HANDOFF_KEY_HORMONIOS`.

**Pronto quando:**
1. Uma pessoa sem sessão sai da folha, passa pelo Google e volta com a reserva confirmada.
2. Quem já entrou por código e entra pelo Google com o mesmo e-mail cai na mesma linha de `hg_users` e no mesmo cadastro do Transicionais.

**Depende de:** Fase 4 de `transicionais/plano-transicionais.md` (T4.1, T4.2) e decisões A1 e A3 de `transicionais/plano-oauth2.md`.
