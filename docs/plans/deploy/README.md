# Plano de deploy por provedor

Rascunho de arquitetura para publicar o projeto em mais de um provedor (dev, Vercel, Cloudflare)
sem mudar o núcleo. Virou tarefas, com entradas isoladas (`api/`, `cronjob/`, `webhook/`) que
chamam o usecase pelo contrato dele, e `deploy/<ambiente>`, que é do ambiente e não da entrada:

- **T5 envolviment-app** ([spec-5](../../spec/spec-5-envolviment-app.md)): `cronjob/handler.ts`
  chama o `JobUsecase` direto; `deploy/dev/` e `deploy/vercel/`. O `vercel.json` fica na raiz.
- **T6 cronjob** ([spec-6](../../spec/spec-6-cronjob.md)): `deploy/cloudflare/` sobe o `cronjob`
  (`scheduled()` → handler), um cron por tipo.
- **T7 webhook:** `webhook/` como worker separado na Cloudflare.

O resto deste arquivo é o rascunho original.

## Contexto

- A aplicação tem três partes: **front** (páginas do Vite), **`/api`** (BFF) e **jobs** (cron que
  reenvia a fila `integration_status`).
- O Transicionais roda num servidor em casa. O próprio usecase já envia na hora; o job é só a
  rede de segurança para quando falta luz ou cai a internet: quando o servidor volta, a fila
  esvazia.
- Volume esperado: 1 evento por semana, 30–50 pessoas novas (depois de cadastradas não voltam à
  fila) e 30–50 presenças por evento. Pior caso depois de uma queda: ~100 itens, uma vez.
- O Transicionais é **idempotente** para criar pessoa e presença; **não é** para criar/atualizar
  evento.

## O código já é compatível com a Cloudflare

- Os handlers de `api/**/*.ts` exportam `GET`/`POST` recebendo `Request` e devolvendo `Response`.
- Criptografia por Web Crypto (`globalThis.crypto.subtle`, `randomUUID`), sem `node:crypto`.
- Dependências: só `zod` e `@supabase/supabase-js`, as duas rodam em Workers.
- Sem `node:`, `Buffer` ou `fs` no backend.
- `process.env` funciona no Worker com `compatibility_flags = ["nodejs_compat"]` e
  `compatibility_date` ≥ 2025-04-01.

O Cloudflare **Pages** não tem cron; por isso o alvo é um **Worker com static assets**: páginas,
`/api` e jobs num deploy só.

## Jobs

Cada execução não sincroniza a base inteira: busca até `MAX_ITEMS_PER_JOB` (hoje 30) itens
`Pending` do `integration_status` cujo horário de nova tentativa já chegou.

- **Fila vazia (caso normal):** 1 consulta ao Supabase, nada no Transicionais.
- **Custo por item:** ~5–6 fetches (ler a entidade, 1–2 no Transicionais, gravar status e
  entidade). Estimativa, não contada chamada a chamada.
- **Limite da Cloudflare free:** 50 subrequests por execução → cabem ~7–8 itens. No pago
  (US$5/mês) são 1000.
- Ao passar do limite, os itens em andamento ficam `Pending` e voltam na próxima rodada. Para
  pessoa e presença o reenvio é inofensivo (idempotente).
- **Evento:** com cron próprio, a execução tem ~1 item e nunca bate no limite. O risco de
  duplicar existe em qualquer hospedagem: o Transicionais cria, a resposta não volta, o status
  fica `Pending` e o job cria de novo. Saídas possíveis: conferir se já existe antes de criar, ou
  tratar indisponibilidade do evento como `manualRetry`.

### Configuração no free

| Cron | Tipo | Lote |
|---|---|---|
| a cada 5–10 min | event | atual (sempre cabe) |
| a cada 5–10 min | user | 30 (pode parar no meio) ou 8 (sem barulho no log) |
| a cada 5–10 min | attendance | igual ao user |

Tempo para zerar ~50 itens com lote 8: cron de 1 h → ~6–7 h; 15 min → ~1h30; 5 min → ~30 min.

## Núcleo e adaptadores

O núcleo não muda: páginas, `api/**/*.ts` e `src/serve-utils/`. Cada provedor resolve três
coisas: servir as páginas, rotear `/api/*` e disparar os jobs.

```
                        ┌──────────────────────────────────────┐
                        │              NÚCLEO                  │
                        │  index.html · guias.html · flow.html │
                        │  api/**/*.ts   (GET/POST: Request →  │
                        │                 Response)            │
                        │  src/serve-utils/  (usecases, repos) │
                        └──────────────────┬───────────────────┘
                                           │
             ┌─────────────────────────────┼─────────────────────────────┐
             │                             │                             │
     ┌───────▼────────┐          ┌─────────▼─────────┐         ┌─────────▼──────────┐
     │   dev (vite)   │          │      vercel       │         │     cloudflare     │
     │ vite serve     │          │ vite build → dist │         │ vite build → dist  │
     │                │          │                   │         │ + worker bundle    │
     ├────────────────┤          ├───────────────────┤         ├────────────────────┤
     │ páginas: vite  │          │ páginas: dist/    │         │ páginas: assets    │
     │ /api: plugin   │          │ /api: nativo      │         │ /api: fetch() →    │
     │  (middleware)  │          │  (cada arquivo    │         │  roteador          │
     │                │          │   vira função)    │         │                    │
     │ cron: manual   │          │ cron: vercel.json │         │ cron: scheduled()  │
     │ scripts/cron   │          │  crons → GET      │         │  triggers.crons    │
     │  .mjs          │          │  /api/cron/*      │         │  → JobUsecase      │
     ├────────────────┤          ├───────────────────┤         ├────────────────────┤
     │ env: .env.local│          │ env: painel       │         │ env: wrangler      │
     │                │          │  Vercel           │         │  secrets +         │
     │                │          │                   │         │  nodejs_compat     │
     └────────────────┘          └───────────────────┘         └────────────────────┘
```

### Estrutura

```
deploy/
├── shared/
│   └── routes.ts            → tabela /api/* → módulo (import.meta.glob('/api/**/*.ts'))
├── dev/
│   └── vite-plugin.ts       → o vercelApiDev() de hoje, usando routes.ts
├── vercel/
│   └── vercel.json          → cleanUrls, crons
└── cloudflare/
    ├── worker.ts            → fetch() usa routes.ts; scheduled() chama os jobs
    └── wrangler.toml        → assets = dist/, crons, compatibility_flags
vite.config.ts               → escolhe o adaptador pelo mode
```

O `routes.ts` é a peça que une tudo. Hoje o plugin de dev acha o arquivo com `existsSync`, que
não existe no Worker. Com `import.meta.glob`, a tabela é montada no build e o dev e a Cloudflare
usam a mesma. A Vercel roteia sozinha pelos arquivos.

### `vite.config.ts` (assinaturas)

```ts
type Provider = "dev" | "vercel" | "cloudflare"

const pages: Record<string, string>                       // main, flow, guides
function providerFrom(mode: string, command: "serve" | "build"): Provider
function pluginsFor(provider: Provider): PluginOption[]
//   dev        → [apiDevPlugin()]
//   vercel     → []
//   cloudflare → [cloudflare({ configPath: "deploy/cloudflare/wrangler.toml" })]

export default defineConfig(({ mode, command }): UserConfig)
```

No Cloudflare, o `@cloudflare/vite-plugin` (oficial) empacota o `worker.ts` junto com as páginas
no mesmo `vite build`, e o `vite dev --mode cloudflare` roda no runtime real (workerd).

### Scripts

```
dev               → vite                        (dev)
dev:cf            → vite --mode cloudflare      (dev no runtime da Cloudflare)
build:vercel      → vite build --mode vercel
build:cloudflare  → vite build --mode cloudflare
deploy:cloudflare → build:cloudflare && wrangler deploy
```

### O que cada provedor leva

| | Páginas | `/api` | Cron | Bundle |
|---|---|---|---|---|
| **dev** | vite serve | middleware + `routes.ts` | `scripts/cron.mjs` à mão | — |
| **vercel** | `dist/` | `api/` nativo | `vercel.json` → `GET /api/cron/*` | o Vite só faz o front; a Vercel compila `api/` |
| **cloudflare** | `dist/` (assets) | `worker.ts` + `routes.ts` | `scheduled()` | o Vite faz front e worker juntos |

## Pontos de atenção

- **Cron na Vercel:** no Hobby roda no máximo 1 vez por dia; a rede de segurança a cada 5–10 min
  só no Pro. Na Cloudflare free funciona.
- **`netlify.toml`:** se o Netlify sair dos planos, os headers viram `_headers` (Cloudflare) ou
  `headers` no `vercel.json`.
- **Núcleo sem provedor:** tudo que depende do provedor fica em `deploy/`. Um `deploy/aws/`
  (Lambda + S3/CloudFront + EventBridge) teria o mesmo papel do `worker.ts`.
