# Back — T4: integrate-groupos-catalog

> **Concluído em 2026-10-28.** O que cada usecase faz: [`docs/usecases/producao.md`](../../usecases/producao.md),
> [`ensaio.md`](../../usecases/ensaio.md) e [`sincronizacao.md`](../../usecases/sincronizacao.md).
> O detalhe para agente: [`spec/spec-4-integrate-groupos-catalog.md`](../../spec/spec-4-integrate-groupos-catalog.md).

## Como Produção, quero ver e editar o estoque de cada grupo igual ao do Transicionais

Criado: no **repo do Transicionais**, editar o encontro (o PUT de cada support-type).

Alterados: a leitura do encontro monta o catálogo de instrumento a partir dos grupos do encontro; o **usecase**
`UpdatingInternalEventUsecase` envia depois de gravar; o `EventJobUsecase` reenvia o evento que já
tem id do Transicionais.

O grupo zerado aparece com 0; sem support-type cadastrado lá, não aparece. Mudar o estoque aqui muda lá.

## Como pessoa, quero ver o ensaio mesmo com o banco vazio

Criado: no **repo do Transicionais**, achar o último encontro Público sem o id.

Alterado: o **usecase** `FindingPublicEventUsecase` busca no Transicionais e grava quando não acha aqui.

## Como time, quero que a presença enviada volte com o id e o hash do Transicionais

Criado: no **repo do Transicionais**, buscar a presença da pessoa no dia.

Alterados: `CreatingOrUpdatingAttendanceUsecase` e `AttendanceJobUsecase` gravam o hash e o id depois
de enviar.
