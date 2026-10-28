# spec-6 — cronjob: o job na Cloudflare

> **Concluído em 2026-10-28.** Tarefa: [`plans/back/T6-cronjob.md`](../plans/back/T6-cronjob.md).
> A entrada do cron é a spec-5 B1 (`cronjob/handler.ts`).

## Desenho

```
 APLICAÇÃO (entrada + núcleo)                     DEPLOY (ambiente)
 ──────────────────────────────────────────        ─────────────────────────────────────
 cronjob/handler.ts                                deploy/cloudflare/
   handler({ entity })                               package.json   wrangler, zod, supabase
     → Envolviment → JobUsecase                      wrangler.toml  crons, nodejs_compat
       ▲                                             cronjob.ts     scheduled()
       │                                                │
       └──────────── handler({ entity }) ◄──────────────┘
                                        controller.cron → entity   (A3)

 */5      → event
 1-59/5   → user           cada um numa execução: 50 subrequests cada (free)
 2-59/5   → attendance
```

## A. Deploy do cronjob

| # | Regra |
|---|---|
| A1 | `deploy/cloudflare/cronjob.ts` só traduz o gatilho: `scheduled(controller)` acha a entity pelo `controller.cron` e chama `handler({ entity })`. Cron sem entity → `Error` de configuração. Sem `fetch()` e sem rota. |
| A2 | `wrangler.toml`: worker `hormonios-cronjob`, `main = cronjob.ts`, `compatibility_flags = ["nodejs_compat"]`, `compatibility_date` ≥ 2025-04-01 (o `process.env` funciona; o `Envolviment` não muda). Sem assets. |
| A3 | Um cron por entity, a cada 5 min, em minutos diferentes (`*/5` event, `1-59/5` user, `2-59/5` attendance): cada entity roda numa execução própria, com o seu limite de subrequests. A agenda é do deploy, não da entrada. |
| A4 | Env por `wrangler secret put`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TRANSICIONAIS_URL`, `TRANSICIONAIS_ORG_ID`, `TRANSICIONAIS_USER`, `TRANSICIONAIS_PASSWORD`; `TRANSICIONAIS_ENABLED` em `[vars]` quando precisar desligar. Local: `deploy/cloudflare/.dev.vars`. |
| A5 | `TRACE_FETCH=true` (só no `.dev.vars`) liga no worker o mesmo trace do dev (spec-3 E1–E3, `deploy/shared/trace-fetch.ts`): `[supabase]` e `[transicionais]` com ms por chamada e `[cronjob] CRON <cron> → <status> (<ms>)` por execução. Ausente (produção) = sem trace. |
| A6 | Logs de produção: `[observability]` ligado no `wrangler.toml` (Workers Logs, `head_sampling_rate = 1`, `invocation_logs`). Todo log do logger (`track`, `appError`, `error`…) de cada execução do cron fica no painel do worker. A linha é JSON, e o painel filtra pelos campos (`context`, `scope`, `key`, `hormonios*Id`). Sem isso, só ao vivo pelo `wrangler tail`. |
| A7 | Trace dentro do job (lib.md L9, L10): cada item gera `"<tipo> job item"` com o id do Hormônios e o `status` (`SYNCED`, `PENDING`, `MANUAL_RETRY`, `REJECTED`; não achado = `MANUAL_RETRY`), e cada execução fecha com `"<tipo> job finished"` e `found`, `synced`, `pending`, `manualRetry`, `rejected`, `notSent`. Falha inesperada de um item continua só no log de erro (`"<tipo> job failed"`). |

## B. Pacotes

| # | Regra |
|---|---|
| B1 | `deploy/cloudflare/` é um pacote à parte, instalado só nele (`npm install` dentro da pasta, com `package-lock.json` próprio): `wrangler` e as dependências que o bundle leva (`zod`, `@supabase/supabase-js`). O `[alias]` do `wrangler.toml` faz o bundle usar essas, não as da raiz. A Vercel não vê nada disso. |
| B2 | A aplicação (`cronjob/`, `src/bff/`) não tem `package.json` próprio; as dependências dela continuam também na raiz, para o dev e a Vercel. Mudou a versão de `zod` ou do Supabase na raiz → muda aqui também. |
| B3 | Da raiz: `yarn cronjob:dev:cf` (`wrangler dev --test-scheduled`) e `yarn cronjob:deploy`. Teste local de uma entity: `curl "localhost:8787/__scheduled?cron=1-59/5+*+*+*+*"` (user). Sem a Cloudflare, `yarn cron:sync --type=<tipo>` (spec-5 B2). |
| B4 | Cron que não está na agenda → erro na execução (A1); erro do job (ex.: 503 com o Transicionais desligado) também falha a execução, e aparece no painel da Cloudflare. |
