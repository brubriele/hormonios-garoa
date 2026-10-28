# Back — T6: cronjob

> **Concluído em 2026-10-28.** Nenhum usecase muda: [`docs/usecases/`](../../usecases/README.md) fica igual. O
> detalhe para agente: [`spec/spec-6-cronjob.md`](../../spec/spec-6-cronjob.md).

## Como time, quero que a fila esvazie sozinha a cada 5 minutos na Cloudflare

Criado: o deploy do job em [`deploy/cloudflare/`](../../../deploy/cloudflare/cronjob.ts), como
pacote à parte (wrangler e as dependências do bundle), com `wrangler.toml` próprio e um cron por
tipo (ensaio, pessoa, presença).

Já existia: a entrada [`cronjob/handler.ts`](../../../cronjob/handler.ts) (T5) e o `JobUsecase`.

Quando o Transicionais volta de uma queda, o que ficou pendente vai sozinho em até 5 minutos.
