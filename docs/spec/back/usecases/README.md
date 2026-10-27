# Usecases do BFF

> Um doc por **domínio**. Cada usecase é uma seção que referencia o seu arquivo em
> `src/serve-utils/usecases/`. Cada seção é um ADR curto: o que o usecase faz e por quê, sem
> código. O padrão de código está em [`usecases.md`](../../../agent_docs/backend/usecases.md).
> Spec da fase: [`../README.md`](../README.md).

## Modelo

```markdown
# <Domínio>

> Atualizado em <AAAA-MM-DD> (fase <N>).

## <NomeUsecase> — `<rota>`

> [`usecases/<arquivo>.ts`](../../../../src/serve-utils/usecases/<arquivo>.ts)

**Contexto.** Uma a três linhas: o problema que ele resolve e quem chama.

**Decisão.**
- Os passos, na ordem, e as regras que valem (citando as decisões: E2.9, RR5, D29…).

**Consequências.**
- O que fica mais fácil ou mais difícil, os limites conhecidos e as dúvidas abertas.
```

## Domínios

| Doc | Usecases |
|---|---|
| [`ensaio.md`](ensaio.md) | `FindingPublicEvent` |
| [`producao.md`](producao.md) | `FindingInternalEvent`, `CreatingInternalEvent`, `UpdatingInternalEvent` (o login não tem usecase) |
| [`reservas.md`](reservas.md) | `CreatingOrUpdatingAttendance`, `FindingUserBooking` |
| [`sincronizacao.md`](sincronizacao.md) | `Webhook`, `EventWebhook` |
