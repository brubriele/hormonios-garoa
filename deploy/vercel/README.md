# Vercel

O app sobe na Vercel sem arquivo nesta pasta (spec-5 C1, C2):

- **`vercel.json` na raiz** (`cleanUrls`). A Vercel só lê o da raiz.
- **Build:** `yarn build` (Vite) gera as páginas em `dist/`; a Vercel compila cada arquivo de
  `api/` como função e roteia sozinha.
- **Env no painel** (Settings → Environment Variables): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `TRANSICIONAIS_URL`, `TRANSICIONAIS_ORG_ID`, `TRANSICIONAIS_USER`,
  `TRANSICIONAIS_PASSWORD`, `TRANSICIONAIS_ENABLED`, `CRON_SECRET`, `WEBHOOK_API_KEY`, `COOKIE_KEY` e
  `ADMIN_KEY`.
- **Nada de `deploy/dev`** entra no build: o `vite.config.js` só carrega o dev no `serve`
  (spec-5 A3).
- **Sem cron:** o job roda na Cloudflare ([`../cloudflare/README.md`](../cloudflare/README.md)). A
  rota `api/cron/sync.ts` continua para quem chamar por HTTP com `CRON_SECRET`.
