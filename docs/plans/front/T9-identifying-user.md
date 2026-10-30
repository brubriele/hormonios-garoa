# Front — T9: identifying-user

> **Concluído em 2026-10-30.** As telas e os textos são os de hoje: só o novo muda. O detalhe para agente:
> [`spec/spec-9-identifying-user.md`](../../spec/spec-9-identifying-user.md#front--t9).

## Como pessoa, quero reservar o instrumento direto, sem confirmar a presença antes

Alterado em `app.js`: quem abre a folha do instrumento sem presença confirmada (sem aparelho
reconhecido) passa por duas chamadas: primeiro a presença, que reconhece o aparelho, depois o
instrumento. O fluxo ideal continua presença → instrumento.
