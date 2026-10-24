# bff-hormonios — Fase 3 (opcional): Login etapa 1 (código por e-mail)

> Índice e decisões comuns: [`README.md`](README.md). Recursos do Transicionais: nenhum novo nesta fase.

## Objetivo

**Perfumaria, opcional.** A sincronização já funciona sem login desde a fase 2, e o Transicionais
pode mostrar os ingressos da pessoa se for preciso. O login aqui só serve para:

- ver e desfazer as próprias reservas em **outro aparelho**, e não só no do `hg_device`;
- provar que o e-mail é da pessoa antes de permitir alterar uma reserva feita com ele.

## Decisões

| # | Decisão | Origem |
|---|---|---|
| E3.1 | **Login local do BFF:** e-mail → código de 6 dígitos (10 min, 5 tentativas) → confirmado. Não chama o Transicionais. | conversa |
| R7 | Sessão do BFF: cookie `hg_session`, assinado, com o id de `hg_users`. O `hg_device` continua para quem não entra. | conversa |
| E3.2 | Com sessão, "Minhas reservas" e "Desfazer" valem para todas as reservas do e-mail, de qualquer aparelho. | conversa |

## Em aberto

| # | Pergunta | Recomendação |
|---|---|---|
| B4 | Quem envia o código: o envio de e-mail do Transicionais ou um serviço próprio do BFF? | Usar o do Transicionais, se puder ser chamado pelo serviço. Senão, um serviço como o Resend. |

## Modelo (migration 3)

```sql
alter table hg_users add column email_verified_at timestamptz;

create table hg_login_codes (
  email text primary key,
  code_hash text not null,                  -- nunca o código em texto
  attempts int not null default 0,
  expires_at timestamptz not null
);
```

## Rotas do BFF

| Rota | Faz |
|---|---|
| `POST /api/entrar` | Grava `hg_login_codes` e envia o código. Limite por e-mail e por IP. |
| `POST /api/entrar/confirmar` | Confere o hash, a validade e as tentativas. Preenche `email_verified_at` e grava `hg_session`. |
| `POST /api/sair` | Apaga `hg_session`. |

## Tasks

**E3-S1. Migration 3**

**E3-S2. Rotas de login** (código, limite, envio, `hg_session`)

**E3-S3. Reservas com sessão** (E3.2: minhas reservas e desfazer por e-mail)

**E3-W1. Front:** "Entrar com e-mail" → código, e "Sair".

**Envs novas:** `SESSION_KEY` e as do envio de e-mail (B4).

**Pronto quando:** a pessoa entra num segundo celular com o código e vê e desfaz a reserva feita no
primeiro.
