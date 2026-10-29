# spec-5 — envolviment-app: entradas e deploy por ambiente

> **Concluído em 2026-10-28.** Tarefa: [`plans/back/T5-envolviment-app.md`](../plans/back/T5-envolviment-app.md).
> Rascunho de origem: [`plans/deploy/README.md`](../plans/deploy/README.md).

## Desenho

```
 Entradas (cada uma com a sua regra de entrada; chamam o usecase pelo contrato dele)
 ────────────────────────────────────────────────────────────────────────────────
 api/                REST do front                       já existia
 cronjob/handler.ts  { entity } → JobUsecase              (B1)
 webhook/            fetch → WebhookUsecase               T7
                       │
                       ▼
            src/bff/ (núcleo: Envolviment, usecases, repos — não muda)

 deploy/<ambiente>  é do ambiente, não da entrada: diz como cada ambiente sobe as entradas
 ──────────────────────────────────────────────────────────────────────────────────────
 deploy/dev/                 /api/* → arquivo de api/; só no serve (A1–A3)
 deploy/vercel/README.md     api/ nativo, vercel.json na raiz      (C1, C2)
 deploy/cloudflare/          cronjob (T6) e webhook (T7)

 Teste do job
 ────────────
 yarn cron:sync --type=<event|user|attendance>
   └─ scripts/cron.mjs → Vite ssrLoadModule('/cronjob/handler.ts') → handler({ entity })   (B2)
```

## A. dev

| # | Regra |
|---|---|
| A1 | `deploy/dev/vite-plugin.ts` (`apiDevPlugin()`, só no `serve`) é o servidor de `api/` que antes ficava no `vite.config.js`. `/api/<rota>` → `api/<rota>.ts` ou `api/<rota>/index.ts`; fora disso, 404 `{ key: "NOT_FOUND_ERROR" }`; método sem handler, 405. |
| A2 | Mantém o que o dev fazia: carrega `.env`/`.env.local`, os logs de ms (spec-3 E1–E3, em `deploy/shared/trace-fetch.ts`, também usado pelo worker do cronjob: spec-6 A5) e tira o `Secure` do cookie no acesso pelo IP da rede. |
| A3 | O `vite.config.js` tem só o que é comum (o build das três páginas). O que é do dev (`apiDevPlugin` e `server.host`) fica em `deploy/dev/vite.config.ts` e só é carregado quando o comando é `serve` (`yarn dev`); no `vite build` (Vercel) nada de `deploy/dev` é carregado. |

## B. cronjob

| # | Regra |
|---|---|
| B1 | `cronjob/handler.ts` é a entrada do cron, como uma lambda: `handler({ entity })` pede o `JobUsecase` ao `Envolviment` e chama `execute` com o mesmo contrato da rota. Sem HTTP e sem `CRON_SECRET`. |
| B2 | `yarn cron:sync --type=<tipo>` (`scripts/cron.mjs`) chama o handler direto, carregado pelo Vite (`createServer` + `ssrLoadModule`), porque os imports do núcleo não têm extensão e o Node puro não os resolve. Não precisa do `yarn dev` rodando. |
| B3 | A rota `api/cron/sync.ts` continua, para quem chama por HTTP. |

## C. vercel

| # | Regra |
|---|---|
| C1 | `vercel.json` na **raiz** (`cleanUrls`), porque a Vercel só lê o da raiz. Sem `crons`. |
| C2 | O `vite build` gera o front em `dist/`; a Vercel compila `api/`. Env pelo painel ([`deploy/vercel/README.md`](../../deploy/vercel/README.md)). |

## Fora desta tarefa

- `deploy/cloudflare/` (subir o `cronjob` na Cloudflare): T6, [spec-6](spec-6-cronjob.md).
- `webhook/` como worker separado: T7.
- `netlify.toml` fica como está.
