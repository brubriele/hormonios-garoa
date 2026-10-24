# Implementação da fase 1 do bff-hormonios

> Plano de execução de [`bff-fase-1.md`](bff-fase-1.md). Feito com a Bea em 2026-10-24.
> **Status:** onda 1 (Passos 0 e 1) feita. Ondas 2 a 5 por subagente, uma por vez.

## Contexto

Hoje o protótipo (`app.js`) guarda tudo no `localStorage`: cada aparelho vê só os próprios dados e
a senha da Produção (`garoa`) está no código. A fase 1 (`docs/spec/bff-fase-1.md`) troca isso por
um BFF na Vercel com Supabase. Assim, todos os aparelhos veem as mesmas vagas, a última vaga não é
reservada duas vezes e a Produção fica protegida por uma `ADMIN_KEY`.

Junto com isso, a documentação muda de papel:
- O que está hoje em `docs/spec/` é **plano**. Vai para `docs/plans/`.
- `docs/spec/back/` e `docs/spec/front/` passam a descrever o que **já está implementado**.
- Cada uma dessas pastas tem um `README.md` que aponta só para a spec mais recente e mantém um
  changelog curto, para uma pessoa ler o que cada spec mudou.

**Regras confirmadas com a Bea (2026-10-24):**
- a presença pode ser sem instrumento (`groupId` opcional);
- a reserva é **por e-mail**: uma por e-mail no ensaio;
- o mesmo e-mail com outro nome **troca** o nome e o pronome;
- "Não vou" tira a reserva do instrumento e libera a vaga;
- a pasta `src/serve-utils/http/` está aprovada;
- uma presença sem instrumento pode ganhar um instrumento, desde que no mesmo aparelho.

**Decidido (2026-10-24):** o id do ensaio é `dayKey`, **texto**, dentro do jsonb `data` de
`hg_current_event`. Na fase 1 guarda um UUID local. Na fase 2 passa a guardar
`String(configDayId)` do Transicionais, sem mudar coluna.

**Dúvidas:** o que não for bloqueante e não estiver nos docs vai para
[`bff-fase-1-duvidas.md`](bff-fase-1-duvidas.md), para a Bea responder depois.

Decisões já tomadas: sem testes automatizados agora (só `tsc --noEmit` e teste manual), Supabase de
dev num **projeto remoto**, `netlify.toml` fica como está. O código segue
`docs/agent_docs/backend/` (CLAUDE.md).

## Passo 0 — Reorganizar os docs ✅ feito

1. ~~Mover `docs/spec` para `docs/plans`~~: já foi feito (ainda sem commit; o git mostra como
   arquivos apagados + `docs/plans/` novo, então dar `git add -A docs/` para registrar como
   renomeação). Copiar este plano para `docs/plans/bff-fase-1-implementacao.md`.
2. Em `docs/plans/README.md`, o título passa de "Specs do bff-hormonios" para "Planos do
   bff-hormonios".
3. Atualizar quem aponta para `docs/spec/README.md`:
   - `CLAUDE.md` (seção Specs → "Planos": `docs/plans/README.md`, e "Specs (o que está
     implementado)": `docs/spec/back/README.md` e `docs/spec/front/README.md`);
   - `docs/agent_docs/backend/README.md` (linha 4);
   - `docs/agent_docs/backend/api.md`, regra A4 ("entra no plano antes do código").
4. Criar `docs/spec/back/README.md` e `docs/spec/front/README.md` com este formato:
   ```
   # Spec do back (o que está implementado)
   **Atual:** [fase-1.md](fase-1.md)
   ## Changelog
   | Spec | Data | O que mudou |
   | fase-1.md | 2026-xx-xx | Primeira versão: BFF + Supabase, sem login. |
   ```
   A spec traz **só o que é necessário para implementar** aquela entrega, com pouco código. A linha
   do changelog é um resumo dessa spec, em uma frase.
5. As specs `fase-1.md` em si são escritas no **Passo 6**, depois do código, a partir do que foi
   implementado.

## Passo 1 — Atualizar `docs/agent_docs/backend/` antes do código ✅ feito

A fase 1 precisa de dois tipos de código que os docs ainda não cobrem. Pela regra de "Ao terminar"
item 3, o padrão é definido nos docs antes de virar código:

- **`src/serve-utils/http/`** (doc novo `http.md`), com as peças de borda que as 8 rotas repetiriam:
  - `handle(fn)`: envolve a rota, converte `AppError` em `{ key, message }` com `status`, outro
    erro em 500 `INTERNAL_ERROR`, e lê o corpo JSON;
  - `cookies.ts`: lê e grava cookie (`httpOnly`, `Secure`, `SameSite=Lax`, `Path=/`);
  - `device.ts`: `getOrCreateDeviceId(request)` → `{ deviceId, setCookie? }`. `hg_device` é um UUID
    aleatório com validade de 1 ano (E1.2);
  - `admin-session.ts`: assina e confere o `hg_admin` com HMAC-SHA256 por WebCrypto
    (`COOKIE_KEY`), com payload `{ exp }` de 12 h (E1.4). Também tem `requireAdmin(request)`, que
    lança `UnauthorizedError`.
- **Repo do Supabase**: em `repos.md`, um exemplo de `repos/supabase/repo.ts` (sem UrlCollection)
  e um de como um erro da função SQL vira `AppError`.
- `api.md`: o exemplo passa a usar `handle(...)`.
- `README.md`: `http/` entra no mapa de pastas e em **Por camada**. Em **Por tarefa**, "Rota nova"
  passa a incluir `http.md`.

## Passo 2 — Esqueleto (E1-S1)

- **Dependências:** `@supabase/supabase-js`. Dev: `typescript`, `@types/node`, `vercel`
  (`vercel dev` roda o Vite e as Functions juntos) e `supabase` (CLI para a migration).
- **`tsconfig.json`:** só `api/**` e `src/serve-utils/**`, com `strict` e
  `moduleResolution: bundler`. Script `"typecheck": "tsc --noEmit"`.
- **Runtime:** Node padrão da Vercel, com handlers no formato Web
  (`export async function GET(request: Request)`). O código não usa `node:*` (G4), então dá para
  migrar para Edge depois.
- **Envs** (Vercel e `.env.local`, que já está no `.gitignore` por `.env*`): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_KEY`, `COOKIE_KEY`.
- **Migration `supabase/migrations/0001_fase1.sql`:**
  - `hg_users`, `hg_current_event` e `hg_attendances`, como na spec;
  - `enable row level security` nas três, sem política (R10);
  - seed de `hg_current_event` com o `seedInstruments` do `app.js` em `groups`, `supports`
    `[{id:"talabarte",name:"Talabarte"},{id:"baqueta",name:"Baqueta / maçaneta"}]`,
    `bookingOpen: true` e **`dayKey`** (UUID).

    O `dayKey` não está no jsonb da spec, mas é o "id local do ensaio" que vai para `day_key`.
    Ele muda a cada novo ensaio;
  - função `reservar(p_user_id, p_day_key, p_device_id, p_data)`, em `security definer` e com
    `revoke` para `anon`/`authenticated`:
    1. `select … from hg_current_event where id = 1 for update`;
    2. reservas fechadas → `raise exception 'BOOKING_CLOSED'`;
    3. `p_day_key` diferente do `dayKey` atual → `'EVENT_CHANGED'`;
    4. se veio `groupId`: um grupo que não existe ou está inativo → `'INVALID_GROUP'`. Sem
       `groupId` é só presença: os passos 4 e 6 não rodam;
    5. o e-mail (`user_id`) já tem linha no dia com `answer = 'vou'` → `'ALREADY_RESERVED'`
       (E1.3), **exceto** quando a linha é deste aparelho e não tem grupo: aí é só presença
       ganhando um instrumento, e a linha é atualizada;
    6. reservas `vou` do grupo ≥ `stockTotal` → `'SOLD_OUT'` (E1.6);
    7. `insert … on conflict (user_id, day_key) do update` (data, device_id, updated_at). Isso
       permite reservar de novo depois de "Não vou".
  - Aplicar com `npx supabase link` no projeto de dev e `npx supabase db push`.

## Passo 3 — Camadas em `src/serve-utils/`

| Camada | Arquivos |
|---|---|
| `errors/app-error.ts` | Os do exemplo, mais: `BookingClosedError`, `SoldOutError`, `AlreadyReservedError`, `EventChangedError`, `StockBelowReservationsError` (409); `UnauthorizedError` (401) |
| `models/` | `current-event.ts` (`CurrentEvent`, `Group`, `Support`), `user.ts` (`User`: e-mail em minúsculas e sem espaços, R15), `attendance.ts` (`Attendance`: `answer: "vou" \| "nao-vou"`, `groupId: string \| null` (null = só presença), `supportIds`; `supportIds` precisa estar vazio quando `groupId` é null) |
| `interfaces/` | `uuid.ts`, `client-response.ts` (dos docs), `hormonios.ts` (`IRawUser`, `IRawCurrentEvent`, `IRawAttendance`, `IHormoniosRepo`) |
| `clients/supabase-client.ts` | Cria o `supabase-js` uma vez, com a env lida na chamada. `query<T>(fn)` converte `{ data, error, status }` em `IClientResponse<T>` (clients.md, C6) |
| `repos/supabase/repo.ts` | `HormoniosRepo implements IHormoniosRepo`. Métodos: `findCurrentEventOrFail`, `saveCurrentEvent`, `upsertUserByEmail`, `reserve` (rpc `reservar`; mensagem → `AppError`), `cancelByDevice({ dayKey, deviceId, attendanceId })`, `listByDevice({ dayKey, deviceId })`, `listByDay(dayKey)` (com nome e pronome do usuário) |
| `usecases/` | Um por rota (tabela abaixo) |

**Rotas e usecases.** Cada arquivo de `api/` é uma rota, numa lista fechada:

| Rota | Arquivo | Usecase | Regras |
|---|---|---|---|
| `GET /api/ensaio` | `api/ensaio.ts` | `GetEventUsecase` | Vagas = `stockTotal` − reservas `vou` do grupo. Devolve também o total de presenças `vou` (contador da home) |
| `POST /api/reserva` | `api/reserva/index.ts` | `ReserveUsecase` | Normaliza o e-mail. Faz upsert do usuário por e-mail, **sobrescrevendo nome e pronome**. Chama `reserve` com o `dayKey` atual e o `hg_device`. Sem `groupId` é só presença |
| `POST /api/reserva/desfazer` | `api/reserva/desfazer.ts` | `CancelReservationUsecase` | "Não vou": `answer = "nao-vou"`, `groupId = null`, `supportIds = []`. Libera a vaga do instrumento. Só se `device_id` for este aparelho; senão `NotFoundError` |
| `GET /api/minhas-reservas` | `api/minhas-reservas.ts` | `ListMyReservationsUsecase` | Linhas `vou` deste aparelho no `dayKey` atual, com e sem instrumento |
| `POST /api/admin/entrar` | `api/admin/entrar.ts` | — (só borda: `isAdminKey` + `createAdminCookie`, como no exemplo de `api.md`) | Compara com a `ADMIN_KEY` em tempo constante; grava `hg_admin` |
| `GET /api/admin/resumo` | `api/admin/resumo.ts` | `AdminSummaryUsecase` | Presenças, reservas por grupo com nome, pronome e acessórios |
| `PUT /api/admin/ensaio` | `api/admin/ensaio.ts` | `UpdateEventUsecase` | Data, hora, local, WhatsApp, `bookingOpen` e `stockTotal` por grupo. Estoque menor que as reservas → `StockBelowReservationsError` |
| `POST /api/admin/novo-ensaio` | `api/admin/novo-ensaio.ts` | `NewEventUsecase` | Novo `dayKey`, data e hora vazias, local "A definir", `bookingOpen: false`; mantém WhatsApp e grupos. As linhas antigas ficam com o `dayKey` anterior |

As rotas `admin/*`, menos `entrar`, chamam `requireAdmin(request)` antes do usecase.

## Passo 4 — Front (E1-W1)

Arquivos: `app.js` e `index.html`.

- Saem `STORAGE`, `seedInstruments`, `get`/`set`, o seed em `init()` e `participantId`/`shortId`.
  Também sai `#participant-id-short` (o `hg_device` é `httpOnly`).
- Entra `api(path, { method, body })`, que faz `fetch` com JSON, `credentials: "same-origin"` e,
  em caso de erro, lança com a `key`. O estado em memória (`state.event`, `state.mine`) é carregado
  no `init` e de novo depois de cada ação.
- **Folha única (E1.5):** o `#reserve-dialog` ganha o campo **e-mail** e passa a ser a folha toda.
  Ele abre de dois lugares:
  - pela linha de um instrumento, já com o instrumento escolhido;
  - por um botão "Confirmar presença" na home, sem instrumento (só presença, sem os campos de
    talabarte e baqueta).

  Saem a view `#presence`, o `#presence-form` e o item "presence" da navegação. Em "Minhas
  reservas", a presença sem instrumento aparece como "Presença confirmada", e o botão de desfazer
  vira "Não vou". As mensagens por
  `key` são `SOLD_OUT_ERROR`, `ALREADY_RESERVED_ERROR` ("este e-mail já tem reserva neste
  ensaio") e `BOOKING_CLOSED_ERROR`.
- **Produção:** o login faz `POST /api/admin/entrar` (sai `"garoa"`). `renderAdmin` usa
  `/api/admin/resumo`. Salvar ensaio, salvar link, abrir/fechar reservas e o estoque −/+ usam
  `PUT /api/admin/ensaio`. "Encerrar ensaio" usa `POST /api/admin/novo-ensaio`; o `confirm`
  continua.
- **Estados:** "Carregando…" nas listas e um toast de erro. Botões ficam `disabled` enquanto a
  chamada roda.

## Passo 5 — Verificação

1. `npm run typecheck` passa. Build e lint ficam para o fim, depois da onda 5, com a Bea.
2. `npx vercel dev`, com `.env.local` apontando para o projeto de dev.
3. Testes com `curl`:
   - `GET /api/ensaio`;
   - `POST /api/reserva` duas vezes com o mesmo e-mail → a segunda dá 409
     `ALREADY_RESERVED_ERROR`;
   - estoque 1 e dois `POST` em paralelo (`&` no shell) com e-mails diferentes → um 200 e um 409
     `SOLD_OUT_ERROR`;
   - `desfazer` com outro cookie `hg_device` → 404;
   - `admin/*` sem cookie → 401.
4. No navegador, os critérios de "Pronto quando":
   - duas janelas anônimas veem as mesmas vagas;
   - desfazer de outra janela não funciona;
   - a Produção fecha as reservas e a outra janela, ao recarregar, vê "reservas fechadas".

## Passo 6 — Specs do que foi implementado

Só o necessário para implementar, em texto e tabelas, com pouco código:
- `docs/spec/back/fase-1.md`: rotas (request, response e `key` de erro), regras de reserva, tabelas
  e a função `reservar` em passos, cookies e envs. Sem colar o código.
- `docs/spec/front/fase-1.md`: telas, qual rota cada ação chama, estados de carregando e erro e
  mensagens por `key`.
- Data e linha do changelog nos dois `README.md`.
- Em `docs/plans/bff-fase-1.md`, marcar as tasks como feitas.

## Contrato da API (fixo antes dos subagentes)

Back e front são escritos em sequência, e os dois seguem este contrato. Toda resposta é JSON. O
erro é sempre `{ key, message }` com o `status` do `AppError`.

```ts
// GET /api/ensaio
{ dayKey, date, time, location, bookingOpen, whatsappUrl, goingCount,
  groups: [{ id, name, stockTotal, available }], supports: [{ id, name }] }   // só grupos ativos

// POST /api/reserva   body: { email, name, pronoun, groupId: string | null, supportIds: string[] }
// → 201 { id, groupId, supportIds, name, pronoun }      // groupId null = só presença
// (groupId é null em todas as respostas quando é só presença; groupName também)

// POST /api/reserva/desfazer   body: { id }   → 204

// GET /api/minhas-reservas
// → [{ id, groupId, groupName, supportIds, name, pronoun }]

// POST /api/admin/entrar   body: { key }   → 204 (Set-Cookie hg_admin)

// GET /api/admin/resumo
// → { event: <igual ao GET /api/ensaio, com todos os grupos e campo active>,
//     attendances: [{ id, name, pronoun, groupId, supportIds, createdAt }] }

// PUT /api/admin/ensaio   body: parcial de { date, time, location, whatsappUrl, bookingOpen,
//                                             groups: [{ id, stockTotal }] }   → 200 <resumo>

// POST /api/admin/novo-ensaio   → 200 <resumo>
```

Keys de erro: `INVALID_PARAMETER_ERROR` 400, `UNAUTHORIZED_ERROR` 401, `NOT_FOUND_ERROR` 404,
`BOOKING_CLOSED_ERROR`, `SOLD_OUT_ERROR`, `ALREADY_RESERVED_ERROR`, `EVENT_CHANGED_ERROR`,
`STOCK_BELOW_RESERVATIONS_ERROR` 409, `INTERNAL_ERROR` 500.

## Execução por subagentes

Este plano fica salvo como `docs/plans/bff-fase-1-implementacao.md` no Passo 0, e os subagentes
leem esse arquivo. Cada um recebe só o seu passo e o contrato acima, e trabalha na mesma árvore: os
arquivos de cada um não se cruzam. Ninguém commita. Eu reviso e commito ao fim de cada onda.

| Onda | Subagente | Passos | Arquivos dele | Depende de |
|---|---|---|---|---|
| 1 | **eu** (sem subagente) | 0 e 1 | `docs/**`, `CLAUDE.md` | — |
| 2 | **back** (general-purpose) | 2 e 3 | `package.json`, `tsconfig.json`, `supabase/**`, `src/serve-utils/**`, `api/**` | onda 1 (lê `docs/agent_docs/backend/`) |
| 3 | **front** (general-purpose), depois do back | 4 | `app.js`, `index.html`, `styles.css` se precisar | onda 1 + contrato |
| 4 | **verificação** (general-purpose) | 5 | nenhum. Só relata falhas, com a saída dos comandos | onda 3 + Supabase pronto |
| 5 | **specs** (general-purpose) | 6 | `docs/spec/**`, `docs/plans/bff-fase-1.md` | onda 4 sem falhas |

Regras para todos os subagentes:
- **Build e lint só no fim da implementação** (regra deste plano): nenhuma onda roda
  `yarn build` nem `yarn lint`. Durante as ondas, só `npm run typecheck` (`tsc --noEmit`). Hoje o
  repo usa npm (`package-lock.json`) e não tem script de lint.
- O subagente **back** segue o `CLAUDE.md` e lê os docs de `docs/agent_docs/backend/` pela tabela
  **Por tarefa**. Termina com `npm run typecheck` passando.
- Se surgir algo que os docs ou o contrato não cobrem, o subagente para e relata. Ele não inventa
  o padrão.
- Falhas da verificação voltam para o subagente back ou front (`SendMessage`) e a verificação roda
  de novo.

**Antes da onda 4, você faz:** criar o projeto Supabase de dev, preencher o `.env.local` e rodar
`! npx supabase link --project-ref <ref>` e `! npx supabase db push`. Os subagentes não têm as
credenciais.

## Arquivos principais

`docs/plans/**` (movidos), `docs/spec/{back,front}/*`, `docs/agent_docs/backend/{README,api,repos,http}.md`,
`CLAUDE.md`, `package.json`, `tsconfig.json`, `supabase/migrations/0001_fase1.sql`,
`src/serve-utils/**`, `api/**`, `app.js`, `index.html`.
