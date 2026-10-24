# Padrão de código do BFF (/api)

> Docs para agentes e pessoas que escrevem código do bff-hormonios. Planos das fases:
> [`docs/plans/README.md`](../../plans/README.md). O que já está implementado:
> [`docs/spec/back/README.md`](../../spec/back/README.md).

## Como usar

Leia este README inteiro primeiro. Depois, leia só os docs do seu caso, **antes** de escrever código,
e siga as regras e os exemplos deles.

### Por camada

Se for mexer em um arquivo de uma pasta, leia o doc dela:

- **Se for mexer em `api/`** (rotas), leia [`api.md`](api.md).
- **Se for mexer em `src/serve-utils/http/`** (resposta, erro, cookies, sessão), leia [`http.md`](http.md).
- **Se for mexer em `src/serve-utils/errors/`**, leia [`errors.md`](errors.md).
- **Se for mexer em `src/serve-utils/models/`**, leia [`models.md`](models.md).
- **Se for mexer em `src/serve-utils/interfaces/`**, leia [`interfaces.md`](interfaces.md).
- **Se for mexer em `src/serve-utils/clients/`**, leia [`clients.md`](clients.md).
- **Se for mexer em `src/serve-utils/repos/<fonte>/`** (repo ou UrlCollection), leia [`repos.md`](repos.md).
- **Se for mexer em `src/serve-utils/usecases/`**, leia [`usecases.md`](usecases.md).

### Por tarefa

Tarefas que passam por mais de uma camada. Leia os docs e faça os arquivos **na ordem da lista**
(de dentro para fora, para cada camada já ter do que depende):

| Tarefa | Ordem dos docs |
|---|---|
| **Rota nova** | `errors.md` (se precisar de erro novo) → `models.md` → `interfaces.md` → `repos.md` → `usecases.md` → `http.md` (resposta, cookies, sessão) → `api.md` |
| **Integração com uma API externa nova** | `clients.md` (se o client atual não serve) → `interfaces.md` (`IRaw*` e `I<Fonte>Repo`) → `repos.md` (pasta `repos/<fonte>/` com UrlCollection + Repo) |
| **Integração com o Transicionais** (`repos/transicionais/`) | ler o contrato pela seção "Contrato do Transicionais" da skill `code-pattern` (só referência para a tradução) → `clients.md` (timeout) → `interfaces.md` (`IRaw*`) → `repos.md` (`mapper*`, `session.ts`, R10 e R11) |
| **Rota de cron ou de webhook** | `http.md` (H9, H10) → `usecases.md` → `api.md` (A6) |
| **Consulta nova no Supabase** (tabela ou função SQL) | `interfaces.md` (`IRaw*`) → `repos.md` (R9) |
| **Operação nova num repo existente** (ex.: criar reserva no Transicionais) | `interfaces.md` (método na interface do repo) → `repos.md` |
| **Campo novo num model** | `models.md` → `interfaces.md` (o `IRaw*` que traz o campo) → `repos.md` (o `mapper*`) |
| **Erro novo** | `errors.md` → `api.md` (conferir se a rota devolve o `status` certo) |
| **Regra de negócio nova numa rota** | `usecases.md` (novo passo ou `validate*` no usecase da rota) |
| **Teste de usecase** | `usecases.md` (seção "Teste com fake") → `interfaces.md` |

Se a tarefa não está na tabela, leia o doc de cada pasta que vai tocar, como em **Por camada**.

**Testar contra a API de dev do Transicionais:** os usuários estão em
[`transicionais-dev-users.md`](transicionais-dev-users.md), e o do BFF, em
[`setup-hormonios.md`](../../plans/transicionais/setup-hormonios.md). As credenciais ficam no
`.env.local` (`TRANSICIONAIS_USER`, `TRANSICIONAIS_PASSWORD`, `TRANSICIONAIS_URL`).

### Ao terminar

1. Passe pelo [checklist](#checklist-ao-terminar) no fim deste README.
2. Rode `tsc --noEmit`.
3. Se você criou uma pasta, um tipo de arquivo ou uma regra que estes docs não cobrem, avise a pessoa
   em vez de inventar o padrão. Os docs são a fonte do padrão e precisam ser atualizados antes.

## Escopo

Só as rotas em `/api` e o código que elas usam em `src/serve-utils/`. O front (`app.js`, `guias.js`
etc.) fica fora deste padrão.

## Pastas

```
api/                                   rotas da Vercel: só montam o usecase e respondem
src/serve-utils/
  errors/                              AppError e erros de domínio
  models/                              entidades
  interfaces/                          contratos (I*) e formatos crus (IRaw*)
  clients/                             HTTP/SDK compartilhado
  http/                                handle, cookies, hg_device, hg_admin, cron, webhook e IP real
  repos/<fonte>/url-collection.ts      URLs da API externa
  repos/<fonte>/repo.ts                acesso à fonte (transicionais, supabase...)
  repos/transicionais/session.ts       token de membro do Transicionais (login e refresh)
  usecases/                            um arquivo por rota de /api
```

## Fluxo de uma chamada

```
api/<rota>.ts (handle) → Usecase.execute(input) → Repo (pela interface) → Client → API externa / Supabase
                                       ← model                ← IRaw* (mapper no repo)
```

## Regras que valem para todas as camadas

| # | Regra |
|---|---|
| G1 | **Retorno antecipado:** valide e retorne cedo para evitar `if` aninhado. |
| G2 | **Dependências** entram no construtor como `private readonly`. Nada de `public` em dependência. |
| G3 | **Tipos:** sem `any`. Use `Promise<T>`, nunca `Promise<T \| never>`. |
| G4 | **Runtime Edge:** não importe `node:*`. Use `globalThis.crypto` e `fetch`. |
| G5 | **Nomes:** classes em `PascalCase`, arquivos em `kebab-case`. Confira erros de digitação com `tsc --noEmit`. |

## Checklist ao terminar

1. Cada erro novo tem `key` própria (não copie a de outro erro).
2. O usecase depende de interfaces, não de classes concretas.
3. Todo `async` chamado dentro de `try` tem `await`.
4. O formato cru (`IRaw*`) não sai do repo.
5. Todo client devolve `IClientResponse<T>` e não lança. O repo trata o `status`.
6. `tsc --noEmit` passa.
