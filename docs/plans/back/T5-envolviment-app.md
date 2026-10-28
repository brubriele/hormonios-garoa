# Back — T5: envolviment-app

> **Em progresso.** Nenhum usecase muda: [`docs/usecases/`](../../usecases/README.md) fica igual. O
> detalhe para agente: [`spec/spec-5-envolviment-app.md`](../../spec/spec-5-envolviment-app.md).

## Como time, quero rodar o job sem passar por uma rota e organizar o deploy por ambiente

Criado: a entrada do cron, [`cronjob/handler.ts`](../../../cronjob/handler.ts), que chama o
`JobUsecase` direto; o [plugin de dev](../../../deploy/dev/vite-plugin.ts) e o
[README da Vercel](../../../deploy/vercel/README.md) em `deploy/`.

Alterado: o `yarn cron:sync` chama o handler direto, sem HTTP; o `vite.config.js` fica só com o build das
páginas, e o que é do dev (plugin e `server.host`) só carrega no `yarn dev`.

Já existia: as rotas de `api/` (incluindo `api/cron/sync.ts`), o `Envolviment` e o `vercel.json`
na raiz.

O job roda pelo script sem o servidor de pé, e cada ambiente tem a sua pasta em `deploy/`.
