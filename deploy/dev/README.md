# dev

O ambiente local, pelo Vite (spec-5 A1–A3). Só é carregado no `yarn dev` (comando `serve`); o
`vite build` não carrega nada desta pasta.

| Arquivo | O que faz |
|---|---|
| `vite.config.ts` | a parte do dev que o `vite.config.js` da raiz junta no `serve`: o plugin e o `server.host` |
| `vite-plugin.ts` | `apiDevPlugin()`: serve `api/` como a Vercel (`/api/<rota>` → `api/<rota>.ts` ou `api/<rota>/index.ts`), com os logs de ms de `../shared/trace-fetch.ts` |

## Rodar

```bash
yarn dev                               # páginas + api/ em http://localhost:5173 e pelo IP da rede
yarn cron:sync --type=event                      # o job direto pelo cronjob/handler.ts, sem servidor
yarn cron:sync --type=user
yarn cron:sync --type=attendance
yarn cron:webhook --entity=event --id=1         # o webhook por HTTP (precisa do yarn dev)
```

## Env

No `.env.local` da raiz, carregado pelo plugin: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`TRANSICIONAIS_URL`, `TRANSICIONAIS_ORG_ID`, `TRANSICIONAIS_USER`, `TRANSICIONAIS_PASSWORD`,
`TRANSICIONAIS_ENABLED`, `CRON_SECRET`, `WEBHOOK_API_KEY`, `COOKIE_KEY` e `ADMIN_KEY`.

No celular pela rede (`http://10.0.0.x:5173`), o cookie sai sem `Secure`, que o navegador
descartaria fora do `localhost`.
