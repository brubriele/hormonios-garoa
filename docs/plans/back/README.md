# Plano do back (BFF em `api/` e `src/bff/`)

## Changelog

### [fase-1](fase-1.md) — 2026-10-27

- **Adicionadas:** ver o ensaio atual; confirmar presença e reservar instrumento com acessórios;
  desfazer a reserva; ver as minhas reservas; entrar na Produção; ver o ensaio com quem vai;
  editar o ensaio e o estoque; encerrar o ensaio e criar o próximo; logs de erro por contexto.
- **Alteradas:** —
- **Removidas:** —

### [fase-2](fase-2.md) — 2026-10-27

- **Adicionadas:** envio ao Transicionais do ensaio, da pessoa e da presença, com fila e novas
  tentativas; webhook do Transicionais para encontro, pessoa e presença; job que reenvia a fila.
- **Alteradas:** criar ensaio, gravar pessoa e reservar passam a enviar ao Transicionais; os logs
  ganham os contextos `Sync`, `Job` e `TransicionaisRepository`; a presença lida com grupo ou
  suporte fora do evento responde 422 `INVALID_CACHE_STATE_ERROR` em vez de 500; as rotas pedem
  o usecase ao `Envolviment` (singleton lazy: client, session, repos e usecase montados uma vez por
  instância, e o SDK do Supabase não é mais recriado a cada pedido); o token do Transicionais vira
  campo da `TransicionaisSession`; o padrão ganha as regras G9 (no máximo 2 métodos encadeados), G10
  (`new` só num `const`) e G11 (sem `return await`), conferidas pelo `check.cjs`.
- **Removidas:** —

### [T3 — transicionais-desligado](T3-transicionais-desligado.md) — 2026-10-28

- **Adicionadas:** a env `TRANSICIONAIS_ENABLED` desliga o Transicionais de propósito; no dev, o
  tempo em ms de cada chamada ao BFF, ao Supabase e ao Transicionais.
- **Alteradas:** o `Envolviment` injeta o Transicionais desligado (`FakeHttpClient`); desligado, o
  job responde 503 sem tocar a fila.
- **Removidas:** —

### [T4 — integrate-groupos-catalog](T4-integrate-groupos-catalog.md) — 2026-10-28

- **Adicionadas:** o estoque editado pelo admin vai para o Transicionais (PUT do support-type), também
  pelo job; o `GET /api/ensaio` com o banco vazio traz o último Público do Transicionais; a presença
  enviada volta com o id do Transicionais; o nome do encontro lá leva `#<id do Hormônios>`; na
  Produção, com `?debug=1`, os ids do ensaio no Transicionais e no Hormônios; a doc viva dos usecases
  em `docs/agent_docs/usecases/`.
- **Alteradas:** o catálogo de instrumento sai dos grupos da publicação e do support-type
  `instrumento` de cada um (o `type` passa de `instrument` para `instrumento`); a presença com grupo
  leva o support-type do instrumento; a publicação vai em `public.groups` e `public.capacity`, com
  todos os grupos (o `public.vacancies` era descartado pelo Transicionais e apagava os grupos); o
  PUT do support-type mantém os `groupIds` dele; o job de evento reenvia a edição em vez de só marcar
  `SYNCED` (fase-2 J6).
- **Removidas:** —

### [T5 — envolviment-app](T5-envolviment-app.md) — 2026-10-28

- **Adicionadas:** a entrada do cron `cronjob/handler.ts`, que chama o `JobUsecase` direto, como
  uma lambda; `deploy/` por ambiente, com o plugin de dev e o README da Vercel.
- **Alteradas:** o `yarn cron:sync` chama o handler direto, sem HTTP e sem `CRON_SECRET`; o
  servidor de dev das rotas e o `server.host` saem do `vite.config.js` para `deploy/dev/`, carregados
  só no `yarn dev`, com o mesmo comportamento.
- **Removidas:** —

### [T6 — cronjob](T6-cronjob.md) — 2026-10-28

- **Adicionadas:** o job roda na Cloudflare (`deploy/cloudflare/`, worker `hormonios-cronjob`), um
  cron por tipo a cada 5 minutos, chamando a entrada `cronjob/handler.ts`, com os logs guardados no
  painel (Workers Logs); `yarn cronjob:dev:cf` e `yarn cronjob:deploy`.
- **Alteradas:** os jobs de ensaio, pessoa e presença logam cada item (id e status) e um resumo no fim
  (`found`, `synced`, `pending`, `manualRetry`, `rejected`, `notSent`); o `track` aceita campos além
  dos ids; o `package.json` da raiz ganha os scripts `cronjob:dev:cf` e `cronjob:deploy`, que
  chamam o pacote de `deploy/cloudflare` (instalado à parte, com wrangler, zod e Supabase).
- **Removidas:** —

### [T8 — hormonios-repo-otimization-event-read-for-event-and-users-attendance](T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md) — 2026-10-30

- **Adicionadas:** a tabela `current_event` (atual, próximo e reservas abertas) e a função
  `update_current_event`, que troca o estado com a linha travada; liberar e fechar as reservas
  (`PUT /api/admin/reservas`); encerrar o atual e passar para o próximo
  (`POST /api/admin/ensaio/proximo`); ver o próximo ensaio (`GET /api/admin/ensaio?posicao=proximo`);
  o erro `NEXT_EVENT_EXISTS_ERROR` (409).
- **Alteradas:** o ensaio, as presenças e as pessoas vêm numa query só; a pessoa e as presenças dela
  também; o repo tem um get por entidade com filtro nomeado; o `bookingOpen` vem do `isActive` da
  `current_event` e sai da escrita do ensaio; criar ensaio entra como próximo; o Updating acha o
  encontro pelo id; as rotas ficam em português no padrão REST (`GET /api/membros`,
  `POST`/`PATCH /api/membros/reservas`, `POST /api/admin/ensaio`).
- **Removidas:** a cópia do último ensaio do Transicionais com o banco vazio (cria o ensaio vazio);
  `/api/minhas-reservas`, `/api/reserva`, `/api/reserva/desfazer` e `/api/admin/novo-ensaio`.

### [T9 — identifying-user](T9-identifying-user.md) — 2026-10-30

- **Adicionadas:** o `IdentifyingUserUsecase`, que identifica a pessoa pela presença (aparelho,
  e-mail ou e-mail mascarado) e só grava quando ela é nova ou mudou; o domain `UserBooking`.
- **Alteradas:** reservar instrumento exige o aparelho reconhecido; minhas reservas exige o aparelho
  reconhecido e não compara o e-mail; gravar a pessoa volta a só gravar e enviar; a pessoa é lida
  uma vez por chamada.
- **Removidas:** —
