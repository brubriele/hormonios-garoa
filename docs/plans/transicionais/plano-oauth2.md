# Plano: fase 4 — login SSO com OAuth2 (Google/LinkedIn) pelo Transicionais

> Registrado em 2026-10-23. **Fase 4.** Escopo: **só o OAuth2**, ou seja, a ida ao provedor pelo bf-front e a
> volta com a sessão para o bff-hormonios. O lado do Hormônios desta fase está em
> `../bff-fase-4-login-oauth2.md`. Esta fase parte da fase 2: o
> `hg_users` e o pronome no back já existem.
> Fontes (docs do Transicionais, sem leitura de código): `docs/app-busines.md`,
> `bf-back/docs/usecases/{Guest,Auth,Validation,SeatHold}.md`, `bf-front/agent_docs/backend-and-auth.md`,
> `features/acesso-de-outras-aplicacoes.md`, `issues/auth.md`.

## Objetivo

A pessoa reserva o instrumento do ensaio em **duas telas**: a folha de confirmação do Hormônios e a
do provedor (Google/LinkedIn). Ela volta já com a reserva feita.

## Decisões

| # | Decisão | Origem |
|---|---|---|
| D1 | O Hormônios tem um **BFF próprio** (`bff-hormonios`). O navegador só fala com ele, na mesma origem. | conversa |
| D2 | A pessoa entra como **convidado** (`GUEST`) do bloco no Transicionais. O token é `EVENT_GUEST`: um por pessoa, 30 dias, sem refresh. | conversa |
| D3 | **E-mail obrigatório e verificado**, vindo do provedor (GST-02). Serve para "meus dados" e LGPD (GST-10, GST-14). | conversa |
| D4 | O OAuth2 **passa pelo bf-front** (Google/LinkedIn já cadastrados). A marca Transicionais pode aparecer: o coletivo conhece. | conversa |
| D5 | **Sem tela intermediária no Transicionais.** O Hormônios posta o formulário direto em `POST /api/oauth/{provider}` do bf-front, que já recebe o contexto do convidado. | conversa |
| D6 | O bf-front **não grava o `guest_token`** no domínio dele. Ele entrega a sessão ao bff-hormonios, que fica dono dela. | conversa |
| D7 | Entrega da sessão por **POST automático com token cifrado** (60 s, preso ao `state`). Nunca vai na URL. | conversa |
| D8 | **O back não muda no fluxo**: provedor `google`/`linkedin`, `GUEST_REGISTER` e pré-reserva como estão. O pronome entra na fase 2 (T2.6). A ligação pelo e-mail verificado é a T4.3 do `plano-transicionais.md`. | conversa |
| D9 | **Pronome no back**: em `v2_profiles` e `v2_profile_guest`, entregue na fase 2 (T2.6). | conversa |
| D13 | **Mesmo cadastro da fase 2:** a T4.3 liga a identidade do Google ou do LinkedIn ao convidado criado pela rota de serviço com o mesmo e-mail. Na volta, o BFF acha `hg_users` pelo e-mail. | conversa |
| D10 | Instrumento = **grupo do encontro com vagas**. Talabarte/baqueta = **assistências oferecidas** (`supportTypeIds`). Presença e instrumento são uma resposta só ("vou" + grupo). | padrão adotado; confirmar |
| D11 | A pré-reserva (10 min) é criada **antes** de sair para o provedor, como o bf-front já faz. | conversa |
| D12 | Sempre `GUEST_REGISTER`: para quem já tem cadastro, ele reaproveita o cadastro e atualiza nome e pronome (GST-12). O Hormônios não precisa saber se a pessoa já existe. | padrão adotado |

## Em aberto (decidir antes da task indicada)

| # | Pergunta | Recomendação | Bloqueia |
|---|---|---|---|
| A1 | O plano `reserva-ao-abrir-e-fila` tira a pré-reserva sem login (`holdToken`). Ela fica para o bff-hormonios? | Manter enquanto o plano não roda. Quando rodar, passar a reserva para depois da volta do OAuth (perde a garantia durante o login). | T4.1 |
| A3 | Quem já é **membro** do bloco e entra pelo link vira membro (`memberInstead`), não convidado. O que o Hormônios faz nesse caso? | Nesta entrega, voltar com `MEMBER_NOT_SUPPORTED` e uma mensagem. Tratar junto com "Tornar membro". | T4.2 |

## Fluxo

```text
1. Hormônios: folha de confirmação
   nome, pronome, instrumento (grupo), talabarte/baqueta, aceite dos termos
   [Continuar com Google] [Continuar com LinkedIn]
        │ form POST (mesma origem) → bff-hormonios POST /api/oauth/{provider}
        ▼
2. bff-hormonios
   - cria a pré-reserva: POST v2/community/.../days/{configDayId}/holds (grupo) → holdId, holdToken
   - gera state; grava o cookie hg_oauth (cifrado: state, holdId, holdToken, groupId, supportTypeIds)
   - responde uma página que posta o form para o bf-front
        ▼
3. bf-front POST /api/oauth/{provider}
   campos de hoje (nome social, aceites, customId, externalId, configDayId) + pronome + returnTo + state
   → _bf_oauth → provedor
        ▼
4. Provedor: escolher a conta / consentir
        ▼
5. bf-front /api/oauth/{provider}/callback → back POST auth/oauth/{provider} (GUEST_REGISTER)
   - Session.kind = GUEST e returnTo presente: NÃO grava o guest_token
   - responde uma página que posta { handoff } (ou { error, state }) para a URL do returnTo
        ▼
6. bff-hormonios POST /api/oauth/return
   - decifra o handoff; confere aud, exp e state == hg_oauth; apaga hg_oauth
   - acha hg_users pelo e-mail verificado e grava hg_session
   - grava a reserva em hg_attendances
   - POST v2/community/validations/change: ATTENDANCE / ATTENDING, groupId, supportTypeIds,
     holdId + X-Hold-Token
   - 303 → /#my-reservations (ou /#instruments?erro=...)
        ▼
7. Hormônios: "Reserva feita"
```

## Contrato da volta (bf-front ↔ bff-hormonios)

### Ida: campos novos no `POST /api/oauth/{provider}` do bf-front

| Campo | Tipo | Regra |
|---|---|---|
| `pronoun` | string ≤ 40 | opcional no bf-front; obrigatório na folha do Hormônios |
| `returnTo` | string | **id** do cliente (ex.: `hormonios`), nunca uma URL. A URL vem da env do bf-front `OAUTH_RETURN_CLIENTS` (`hormonios=https://<host>/api/oauth/return`). Id desconhecido → 400. |
| `state` | string (≥ 32 bytes aleatórios, base64url) | obrigatório com `returnTo`; volta sem alteração |

Com `returnTo`, o bf-front **não** cria a pré-reserva dele (quem cria é o bff-hormonios, D11) e não
usa `guestReturnUrl`.

### Volta: POST automático (`application/x-www-form-urlencoded`) para a URL do `returnTo`

Sucesso: `handoff=<JWE>`. Falha: `error=<OAuthErrorCode>&state=<state>`.

JWE compacto, `alg: dir`, `enc: A256GCM`, chave `OAUTH_HANDOFF_KEY_HORMONIOS` (32 bytes, uma por
ambiente, nas duas envs). Claims:

```json
{
  "iss": "bf-front",
  "aud": "hormonios",
  "state": "<o state da ida>",
  "iat": 1761200000,
  "exp": 1761200060,
  "jti": "<uuid>",
  "session": {
    "kind": "GUEST",
    "token": "<EVENT_GUEST>",
    "expiresAt": "2026-11-22T12:00:00Z",
    "guest": { "name": "…", "pronoun": "…", "email": "…" }
  }
}
```

| Código de erro na volta | Quando |
|---|---|
| os `OAuthErrorCode` de hoje | falha do provedor ou do back (cancelou, provedor desligado, e-mail não verificado…) |
| `MEMBER_NOT_SUPPORTED` | `Session.kind = MEMBER` (A3) |

### Cookie do fluxo

| Cookie | Opções | Conteúdo |
|---|---|---|
| `hg_oauth` | `httpOnly`, `Secure`, **`SameSite=None`** (a volta é um POST de outro site), `path=/api/oauth`, 10 min, cifrado | state, holdId, holdToken, groupId, supportTypeIds |

A sessão depois da volta é do BFF (`../bff-fase-4-login-oauth2.md`).

## Tasks

As mudanças no Transicionais para esta fase (T4.1 e T4.2 no bf-front) estão no `plano-transicionais.md`.
Aqui fica só o lado do Hormônios.

### bff-hormonios

Rotas, cookie e tasks do lado do Hormônios: `../bff-fase-4-login-oauth2.md`.

**Pronto quando:** em staging, uma pessoa sem sessão sai da folha do Hormônios, passa pelo Google e
volta com a reserva confirmada. A reserva aparece na lista de convidados do painel do Transicionais
com grupo, assistências e pronome. Um `handoff` reapresentado, vencido ou com outro `state` é recusado.

## Ordem

Pré-requisito: fase 2 entregue (Hormônios e Transicionais).

Transicionais (A1, A3) → T4.1 → T4.2 (`plano-transicionais.md`). Do lado do Hormônios, a
`../bff-fase-4-login-oauth2.md`, em paralelo, contra o contrato acima.

## Fora desta entrega

- **"Tornar membro"** a partir do convidado, e com ela o instrumento do membro: escala, assistência ou escolha por encontro (R8 e VAL-07 hoje prendem o grupo do membro à escala).
- **Sessão de membro** (refresh que muda a cada uso, um refresh por vez por sessão).
