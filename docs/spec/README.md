# Specs do bff-hormonios

> Registrado em 2026-10-23. Lado do **Hormônios** (front + bff-hormonios + Supabase + Worker de cron).
> O que precisa ser criado no Transicionais está em `transicionais/` (será movido para o repo do
> Transicionais). Desenho: `ARQUITETURA.drawio` na raiz.

## Fases

| Fase | Spec |
|---|---|
| 1 | [`bff-fase-1.md`](bff-fase-1.md) |
| 2 | [`bff-fase-2.md`](bff-fase-2.md) |
| 3 | [`bff-fase-3-login-email.md`](bff-fase-3-login-email.md) |
| 4 | [`bff-fase-4-login-oauth2.md`](bff-fase-4-login-oauth2.md) |

| Fase | O que entrega | Transicionais |
|---|---|---|
| **1** | BFF + Supabase **como se a API do Transicionais não existisse**. Sem login. Ensaio e estoque editados na Produção do Hormônios. | não é usado |
| **2** | **Integração com a API** do Transicionais e **plano de falha (resiliência)**: o ensaio vem de lá, com cache, webhooks e cron. | leitura e escrita: encontro, vagas, webhooks, reservas como ingressos (token `SERVICE`) |
| **3** | **Login etapa 1 (opcional):** código no e-mail, só para ver e desfazer reservas em outro aparelho. | não é usado |
| **4** | **Login etapa 2 (opcional):** SSO com OAuth2 (Google/LinkedIn). | OAuth2 pelo bf-front |

## Decisões que valem para todas as fases

| # | Decisão | Origem |
|---|---|---|
| R1 | Base própria no **Supabase** (Postgres), com os dados em `jsonb`. | conversa |
| R3 | O bff-hormonios roda na **Vercel (Hobby)**, fora do servidor do Transicionais. Se ficasse junto, cairia junto. | conversa |
| R10 | O Supabase só é acessado pelo BFF (chave `service_role` no servidor). A RLS fica ligada e sem política para a chave pública. | padrão adotado |
| R15 | **O e-mail é guardado desde a fase 1** e é único em `hg_users`. Ele evita duplicidade e é a chave que liga a pessoa ao Transicionais na fase 2. | conversa |
| R17 | **O Hormônios não tem LGPD própria:** sem rotas de "meus dados" e exclusão. Isso fica com o Transicionais. | conversa |
| R16 | Cada fase traz a **sua migration**. Uma fase não muda o que a anterior gravou, só acrescenta. | padrão adotado |

## Fora destas specs

- **"Tornar membro"** e o instrumento do membro (escala, assistência ou escolha por encontro). Hoje a R8 e a VAL-07 prendem o grupo do membro à escala.
- **Sessão de membro** (refresh que muda a cada uso, um refresh por vez por sessão).
