# Back — T3: transicionais-desligado

> **Concluído em 2026-10-28.** O que cada usecase faz:
> [`docs/usecases/sincronizacao.md`](../../usecases/sincronizacao.md). O detalhe para agente:
> [`spec/spec-3-transicionais-desligado.md`](../../spec/spec-3-transicionais-desligado.md).

## Como time, quero desligar o Transicionais sem travar a fila

Criado: a env `TRANSICIONAIS_ENABLED`, lida em
[`lib/upstream.ts`](../../../src/bff/lib/upstream.ts), e o
[`FakeHttpClient`](../../../src/bff/clients/FakeHttpClient.ts).

Alterado: o [`Envolviment`](../../../src/bff/envolviment/Envolviment.ts) injeta o
`FakeHttpClient` quando a env desliga, e o
[`JobUsecase`](../../../src/bff/usecases/job/JobUsecase.ts) responde 503 sem tocar a fila.

Desligado, o envio fica pendente na hora e vai sozinho quando o Transicionais volta.
