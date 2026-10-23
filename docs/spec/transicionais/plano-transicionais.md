# Plano: mudanças no Transicionais (bf-back e bf-front) para o Hormônios, por fase

> Registrado em 2026-10-23. Só o que muda **no Transicionais**. As fases são as das specs do
> Hormônios (`../README.md`). Os contratos que essas mudanças atendem estão em `../bff-fase-2.md`
> (webhooks e envio das reservas) e `plano-oauth2.md` (volta do SSO).
>
> Cada task passa pela skill `rota-ponta-a-ponta` do lado correspondente.

| Fase | No Transicionais |
|---|---|
| 1 | nada; o Hormônios não usa a API |
| 2 | role `SERVICE` no auth existente, IP real, rota de serviço para as reservas, webhooks e pronome |
| 3 | nada; o login por código (opcional) é local do BFF |
| 4 | `returnTo` e volta cifrada no bf-front; ligação por e-mail verificado (opcional, junto com o SSO) |

---

## Fase 2: integração e resiliência

### bf-back

**T2.1. Saída de webhooks**
- [ ] Tabela de saída (outbox) gravada na mesma transação da mudança, para o aviso não se perder se o processo cair.
- [ ] Despachante autenticado por JWT no padrão existente (`role: SERVICE`, `aud` do assinante, validade curta), `deliveryId` estável entre os reenvios e espera crescente por até 24 h.
- [ ] Assinante por organização: URL e `aud`. Por env nesta entrega.
- [ ] O despachante aproveita os avisos que o ao vivo já emite (`EVENT_UPDATED` e a validação no `details/:id/live`, ver `bf-back/docs/usecases/LiveStreams.md`).

**T2.2. `event.updated`**
- [ ] Emitido em toda escrita do encontro público (as que já devolvem `{ content, version }`) e quando as vagas mudam.
- [ ] Corpo com o mesmo retrato do GET público, a `version`, `current` e `vacanciesAt`.

**T2.3. `validation.changed`**
- [ ] Emitido em todo passo novo do ingresso e em toda marcação ou desmarcação de presença, de membro e de convidado.
- [ ] Corpo com `orderId`, pessoa (com `guestId` e e-mail do convidado), resposta, presença, grupo, assistências, `changedAt` e as vagas do dia.
- [ ] O e-mail só vai para convidado. O de membro não sai (regra de hoje).

**Pronto quando (T2.1–T2.3):** e2e provando que um passo novo do ingresso gera um aviso só, com o
mesmo `deliveryId` em todo reenvio, e que uma escrita desfeita na transação não gera aviso.

**T2.4. Role `SERVICE` no auth existente e IP real**
- [ ] Nada de mecanismo novo: o back já recebe um auth e uma strategy por role. Acrescentar a role `SERVICE`, aceita pelo mesmo `@Auth(...)`/guard.
- [ ] O token de serviço é um JWT emitido no padrão que já existe (módulo de token, `issuer` por `AUTH_STRATEGY`). Ele é usado pelo bff-hormonios e pelo job. O convidado continua com o JWT de convidado de hoje.
- [ ] Hoje o back aceita `X-Forwarded-For` só do loopback, e o BFF na Vercel chega pelo túnel. Com token `SERVICE` válido, aceitar o IP que o BFF manda. Sem isso, todo mundo cai no IP da Vercel (limite de 300 pedidos/min).

**T2.5. Rota de serviço para a resposta do convidado**
- [ ] `PUT` numa rota de serviço (nome a definir no contrato), com `@Auth(SERVICE)` (T2.4). Não usa token de pessoa.
- [ ] Corpo: `customId`, `externalId`, `configDayId`, pessoa (`email`, `name`, `pronoun`), `answer`, `groupId`, `supportTypeIds` e `idempotencyKey`.
- [ ] Acha o cadastro de convidado pelo **e-mail** na organização ou cria um, com origem "cliente hormonios".
- [ ] Aplica a resposta com as mesmas regras da resposta do convidado: VAL-10 a VAL-16, VAL-19 e um ingresso por pessoa e dia.
- [ ] Devolve `guestId`, `orderId`, `answer`, `changedAt` e as vagas do dia.
- [ ] Mesma `idempotencyKey` com o mesmo corpo devolve a mesma resposta, sem passo novo.
- [ ] **Regras de negócio a registrar em `docs/app-busines.md` antes do código:**
  - **e-mail não verificado fica pendente:** o convidado criado pela rota de serviço nasce com o e-mail pendente. Ele passa a verificado quando a pessoa entra por um provedor (fase 4, T4.3). Exceção à GST-02 só para esse caso;
  - **termos pendentes:** `terms_version` e `privacy_version` = `NONE`, que significa pendente (exceção à GST-01). Quem reserva no Hormônios não sabe que o Transicionais existe. O aceite real entra quando a pessoa usar o Transicionais. O cadastro fica marcado com a origem "cliente hormonios";
  - e-mail que já é de **membro** da organização: **responde como membro**. O próprio serviço já faz esse roteamento ("membro não vira convidado"), e a rota de serviço só o reaproveita.
- [ ] e2e: cria convidado com e-mail pendente e termos `NONE`, e o ingresso; reenvio não duplica; vaga cheia → 409; sem token ou com token de outra role → 401/403.

**T2.6. Pronome em `v2_profiles` e `v2_profile_guest`** (tarefa simples)
- [ ] Coluna `pronoun VARCHAR(40) NULL` nas duas tabelas (migration).
- [ ] Entra no cadastro e na edição do perfil, na T2.5 e no `GUEST_REGISTER` (`guest.pronoun`), inclusive na atualização do GST-12.
- [ ] Sai nas leituras que já mostram o nome: perfil, lista de presença (membros e convidados), conferência do QR.
- [ ] LGPD: entra no export (GST-14) e é apagado na anonimização (GST-10).
- [ ] Swagger e `yarn openapi:export`.

### bf-front

**T2.7. `pronoun` no fluxo do convidado** (depende da T2.6)
- [ ] Campo no `<form>` da página pública e no `OAuthPending.guest`, repassado ao `GUEST_REGISTER`.
- [ ] `yarn api:sync:offline` depois da T2.6.

---

## Fase 3: login por código (opcional)

Nada no Transicionais. O login é local do BFF.

---

## Fase 4: SSO (Google/LinkedIn, opcional)

O fluxo e o contrato estão no `plano-oauth2.md`.

### bf-front

**T4.1. `returnTo` + `state` no `POST /api/oauth/{provider}`** (depende da A1 do `plano-oauth2.md`)
- [ ] Env `OAUTH_RETURN_CLIENTS` validada; id desconhecido → 400.
- [ ] Guarda `returnTo` e `state` no `_bf_oauth`; com `returnTo`, não cria a pré-reserva.

**T4.2. Volta para o cliente no callback** (depende da A3 do `plano-oauth2.md`)
- [ ] Com `returnTo` e `Session.kind = GUEST`: monta o JWE e responde a página de POST automático (`Cache-Control: no-store`). Não grava o `guest_token`.
- [ ] `kind = MEMBER` → volta com `MEMBER_NOT_SUPPORTED`. Falhas → volta com `error` + `state`.
- [ ] Sem `returnTo`: comportamento de hoje, sem mudança.
- [ ] Testes: id desconhecido, volta com sucesso (JWE decifrável com a chave e `exp` ≤ 60 s), volta com erro e fluxo sem `returnTo` intacto.

### bf-back

**T4.3. Ligar a identidade do provedor ao convidado criado pelo serviço**
- [ ] Quem entra pelo Google ou LinkedIn com o mesmo e-mail de um convidado criado pela T2.5 cai nesse cadastro, e não numa conta nova. Isso revê a R18 ("não junta por e-mail") **só para convidado**.
- [ ] Regra de negócio: registrar em `docs/app-busines.md` antes do código.
- [ ] e2e: convidado criado pela T2.5 e depois `GUEST_REGISTER` pelo `google` com o mesmo e-mail é um cadastro só.

Falta decidir a A1 do `plano-oauth2.md`: manter a pré-reserva sem login (`holdToken`) para o BFF.

---

## Ordem

- **Fase 2:**
  1. T2.4 primeiro: a T2.5, o IP real e os webhooks dependem da role `SERVICE`.
  2. T2.6 antes da T2.5, porque a rota de serviço manda o pronome.
  3. T2.5.
  4. T2.1 → T2.2 → T2.3, que podem andar em paralelo com a T2.5.
  5. T2.7 depois da T2.6.
- **Fase 4:** T4.3 → T4.1 → T4.2.
