# cloudflare

O job (`cronjob/handler.ts`) na Cloudflare, como worker `job-transicionais-sync` (spec-6). É um pacote à
parte: instala aqui dentro, e nada daqui vai para a raiz nem para a Vercel.

| Arquivo | O que faz |
|---|---|
| `package.json` | `wrangler` e as dependências que o bundle leva (`zod`, `@supabase/supabase-js`) |
| `wrangler.toml` | o worker, `nodejs_compat`, os crons e o `[alias]` que faz o bundle usar as dependências daqui |
| `cronjob.ts` | `scheduled()`: acha o tipo pelo cron e chama o `handler({ entity })` |

## Agenda

| Cron | Tipo |
|---|---|
| `*/5 * * * *` | event |
| `1-59/5 * * * *` | user |
| `2-59/5 * * * *` | attendance |

Um cron por tipo, cada um numa execução própria (50 subrequests cada no plano free).

## Instalar

```bash
cd deploy/cloudflare && npm install
```

Mudou a versão de `zod` ou do Supabase na raiz → mude aqui também.

## Env

Local: `deploy/cloudflare/.dev.vars` (fora do git), no formato `CHAVE=valor`. Para criar:
`cp .dev.vars.example .dev.vars` e preencher. Produção, uma vez por
chave:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put TRANSICIONAIS_URL
npx wrangler secret put TRANSICIONAIS_ORG_ID
npx wrangler secret put TRANSICIONAIS_USER
npx wrangler secret put TRANSICIONAIS_PASSWORD
```

`TRACE_FETCH=true` (só no `.dev.vars`) mostra no terminal o tempo de cada chamada ao Supabase e ao
Transicionais e de cada execução do cron, como no `yarn dev` (spec-6 A5).

`TRANSICIONAIS_ENABLED=false` desliga o Transicionais: o job responde 503 sem tocar a fila
(spec-3 D1).

## Rodar e publicar

```bash
yarn cronjob:dev:cf      # da raiz: wrangler dev --test-scheduled
yarn cronjob:deploy      # da raiz: wrangler deploy
```

O `wrangler dev` não roda a agenda sozinho. Com ele de pé, cada link dispara um tipo (no navegador
ou com `curl`):

| Tipo | Teste |
|---|---|
| event | http://localhost:8787/__scheduled?cron=*/5+*+*+*+* |
| user | http://localhost:8787/__scheduled?cron=1-59/5+*+*+*+* |
| attendance | http://localhost:8787/__scheduled?cron=2-59/5+*+*+*+* |

Com `TRANSICIONAIS_ENABLED=false` no `.dev.vars`, cada um termina em 500 com
`UPSTREAM_UNAVAILABLE_ERROR`, sem tocar a fila (spec-3 D1).

## Publicar pelo GitHub Actions

| Workflow | Quando roda | O que faz |
|---|---|---|
| `.github/workflows/build.yml` | em toda PR, e chamado por cada deploy | dois jobs: `typecheck` (`npm run typecheck`) e `build` (`npm run build` e o bundle do worker com `wrangler deploy --dry-run`), que guarda os artefatos `web` (`dist/`) e `worker` (`dist-worker/`) |
| `.github/workflows/cronjob-deploy.yml` | push na `main` que mexe em `src/bff/`, `cronjob/`, `deploy/cloudflare/`, `deploy/shared/` ou nos workflows, e à mão (Actions → deploy job-transicionais-sync (Cloudflare) → Run workflow) | chama o `build.yml` e, se passou, publica o artefato `worker` sem montar de novo (`wrangler deploy --no-bundle`) |

Outro deploy (a Vercel, por exemplo) reaproveita o build com `uses: ./.github/workflows/build.yml`
e `needs: build`.

No GitHub (Settings → Secrets and variables → Actions), uma vez:

| Secret | De onde vem |
|---|---|
| `CLOUDFLARE_API_TOKEN` | My Profile → API Tokens → modelo "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | Workers & Pages → Account ID, na lateral |

Os secrets do worker (Supabase, Transicionais) continuam no `wrangler secret put`: o deploy não
mexe neles.

## Logs em produção

O Workers Logs está ligado (`[observability]`, spec-6 A6): os logs do logger de cada execução
(`processing job`, `user job started`, `app error`…) ficam em Workers & Pages → `job-transicionais-sync`
→ Logs, filtráveis pelos campos do JSON (`context`, `scope`, `key`). Ao vivo: `npx wrangler tail`.

Cron fora da agenda ou erro do job falha a execução, e aparece nesses logs.

`http://localhost:8787/` responde "Handler does not export a fetch() function": o worker só tem
`scheduled()`, o cron não é uma entrada HTTP.
