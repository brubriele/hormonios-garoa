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
- **Se for mexer em `src/serve-utils/repos/<fonte>/{responses,requests}/`** (schema zod e tradução), leia [`requests-responses.md`](requests-responses.md).
- **Se for mexer em `src/serve-utils/lib/`** (datas, `isUnavailable`, logger), ou for escrever um helper ou um log, leia [`lib.md`](lib.md).
- **Se for mexer em `src/serve-utils/usecases/`**, leia [`usecases.md`](usecases.md).

### Por tarefa

Tarefas que passam por mais de uma camada. Leia os docs e faça os arquivos **na ordem da lista**
(de dentro para fora, para cada camada já ter do que depende):

| Tarefa | Ordem dos docs |
|---|---|
| **Rota nova** | `errors.md` (se precisar de erro novo) → `models.md` → `interfaces.md` → `requests-responses.md` → `repos.md` → `usecases.md` → `http.md` (resposta, cookies, sessão) → `api.md` |
| **Integração com uma API externa nova** | `clients.md` (se o client atual não serve) → `interfaces.md` (`I<Fonte>Repo`) → `requests-responses.md` (schemas) → `repos.md` (pasta `repos/<fonte>/` com UrlCollection, Repo, `responses/` e `requests/`) |
| **Integração com o Transicionais** (`repos/transicionais/`) | ler o contrato pela seção "Contrato do Transicionais" da skill `code-pattern` (só referência para a tradução) → `clients.md` (timeout) → `requests-responses.md` (schema zod, `TransicionaisIdSchema`) → `repos.md` (`session.ts`, R10, R11 e R12) |
| **Rota de cron ou de webhook** | `http.md` (H9, H10) → `usecases.md` → `api.md` (A6) |
| **Consulta nova no Supabase** (tabela ou função SQL) | `requests-responses.md` (schema da linha ou do jsonb) → `repos.md` (R9 e R12: só a trava e a transação ficam no SQL) |
| **Operação nova num repo existente** (ex.: criar reserva no Transicionais) | `interfaces.md` (método na interface do repo) → `requests-responses.md` → `repos.md` (R12: a regra vai para o usecase) |
| **Campo novo num model** | `models.md` → `requests-responses.md` (o schema e o `toDomain`/`fromDomain` que trazem o campo) |
| **Refatoração** (sem mudar comportamento) | o doc de cada camada tocada; antes de mexer, guarde a resposta das rotas afetadas e compare com `diff` depois (seção **Ao terminar**) |
| **Erro novo** | `errors.md` → `api.md` (conferir se a rota devolve o `status` certo) |
| **Resposta nova de rota** (formato de saída) | `models.md` (a saída é model em `models/`; a regra de um domínio, como a conta das vagas, é método do model de origem) → `usecases.md` (U9: se a saída junta models de domínios distintos, um mapper em `usecases/mappers/` que devolve o model de saída) |
| **Regra de negócio nova numa rota** | `usecases.md` (novo passo ou `validate*` no usecase da rota) |
| **Teste de usecase** | `usecases.md` (seção "Teste com fake") → `interfaces.md` |

Se a tarefa não está na tabela, leia o doc de cada pasta que vai tocar, como em **Por camada**.

**Testar contra a API de dev do Transicionais:** os usuários estão em
[`transicionais-dev-users.md`](transicionais-dev-users.md), e o do BFF, em
[`setup-hormonios.md`](../../plans/transicionais/setup-hormonios.md). As credenciais ficam no
`.env.local` (`TRANSICIONAIS_USER`, `TRANSICIONAIS_PASSWORD`, `TRANSICIONAIS_URL`).

### Ao terminar

1. Passe pelo [checklist](#checklist-ao-terminar) no fim deste README.
2. Rode `yarn typecheck` e `node .claude/skills/code-pattern/scripts/check.cjs <arquivos tocados>`. O
   `check.cjs` acha os desvios do padrão (abaixo); corrija os dos arquivos que você tocou.
   Refatoração: compare a resposta das rotas afetadas com a de antes (`diff`).
3. Atualize a spec: `docs/spec/back/fase-<N>.md` e, para cada usecase criado ou alterado,
   a seção dele em `docs/spec/back/usecases/<dominio>.md` (modelo em
   [`usecases/README.md`](../../spec/back/usecases/README.md)).
4. Se você criou uma pasta, um tipo de arquivo ou uma regra que estes docs não cobrem, avise a pessoa
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
  interfaces/                          contratos (I*): interface do repo, entradas e filtros
  clients/                             HTTP/SDK compartilhado
  http/                                handle, cookies, hg_device, hg_admin, cron, webhook e IP real
  lib/                                 helpers sem lib externa: datas, isUnavailable, logger
  repos/parse-response.ts              parseResponse (resposta da fonte) e parseInput (corpo que a fonte manda, webhook): o zod de todo response
  repos/transicionais/transicionais-id.ts  TransicionaisIdSchema (volta) e numericId (ida): o id do Transicionais
  repos/<fonte>/url-collection.ts      URLs da API externa
  repos/<fonte>/repo.ts                acesso à fonte (transicionais, supabase...): só I/O
  repos/<fonte>/responses/             schema zod + toDomain(raw): model
  repos/<fonte>/requests/              fromDomain(model): corpo ou parâmetros da fonte
  repos/transicionais/session.ts       token de membro do Transicionais (login e refresh)
  usecases/                            um arquivo por rota de /api
  usecases/mappers/                    <nome>.mapper.ts: monta o model de saída que junta models de domínios distintos (U9)
```

## Fluxo de uma chamada

```
api/<rota>.ts (handle) → Usecase.execute(input) → Repo (pela interface) → Client → API externa / Supabase
                                       ← model                ← XResponse.toDomain(raw) (schema zod)
```

## Regras que valem para todas as camadas

| # | Regra |
|---|---|
| G1 | **Retorno antecipado:** valide e retorne cedo para evitar `if` aninhado. |
| G2 | **Dependências** entram no construtor como `private readonly`. Nada de `public` em dependência. |
| G3 | **Tipos:** sem `any`. Use `Promise<T>`, nunca `Promise<T \| never>`. |
| G4 | **Runtime Edge:** não importe `node:*`. Use `globalThis.crypto` e `fetch`. |
| G5 | **Nomes:** classes em `PascalCase`, arquivos em `kebab-case`. Confira erros de digitação com `tsc --noEmit`. |
| G6 | **Conjunto fechado é enum**, nunca texto solto ([`models.md`](models.md), M6). |
| G7 | **Log só pelo logger** (`createLogger`), nunca `console.*` ([`lib.md`](lib.md)). |
| G8 | **Sem helper repetido:** procure em `lib/` e em `repos/parse-response.ts` antes de escrever um. |

## Checklist ao terminar

1. Cada erro novo tem `key` própria no `ErrorKey` (não copie a de outro erro).
2. O usecase depende de interfaces, não de classes concretas.
3. Todo `async` chamado dentro de `try` tem `await`.
4. O formato cru não sai da pasta da fonte: é o schema do response/request, e não `IRaw*` em `interfaces/`.
5. Todo client devolve `IClientResponse<T>` e não lança. O repo trata o `status`.
6. **O repo tem algum `if` que é regra de negócio?** (escolher, decidir pelo estado, orquestrar, plano de falha → usecase; R12)
7. **O response tem `?? []`, `?? ""`, `?? null` ou `if (!x) throw`** que o schema resolveria? (RR3)
8. **Algum campo é `.nullable().optional()`, `?: X | null` ou objeto anônimo aninhado?** (RR4, RR5, I6, I7)
9. **Sobrou texto solto** (`"PENDING"`, `"vou"`, `string` para conjunto fechado) onde cabe um enum? (M6)
10. **Falha de fonte com `throw new Error`** em vez de `InfraError`? (E6, E7)
11. **`console.*`** em vez do logger? (L4)
12. **Criei um helper** sem procurar em `lib/` e `repos/parse-response.ts`? (G8)
13. **Algum model importa o model de outro domínio para montar a saída, ou o usecase devolve uma interface solta?** É mapper com model de saída (U9).
14. `yarn typecheck` passa e o `check.cjs` não acusa nada nos arquivos tocados.
