---
name: planejamento
description: Planeja uma tarefa do hormônios-garoa e gera os três documentos no formato do repo — a spec (docs/spec/), o plano (docs/plans/back|front|<tema>/) e a doc de usecase (docs/usecases/) — antes de qualquer código, e organiza a execução em ondas (docs pelo orquestrador, código por subagente). Use quando a Bea pedir para planejar, desenhar, "criar o plano", "salvar a spec e o plano", uma feature nova, uma rota nova, uma mudança de arquitetura (ex. deploy, injeção de dependência, chave de integração) ou qualquer tarefa que vá mexer em api/, src/serve-utils/, supabase/ ou nas telas.
---

# Planejamento

Transforma um pedido em **spec + plano + doc de usecase**, nessa ordem de decisão, e só depois
leva ao código. O padrão de código continua na skill `code-pattern` e em
`docs/agent_docs/backend/`. Esta skill cuida do **antes** e do **fecho** da tarefa.

## 1. Entender antes de escrever

1. Leia o `CLAUDE.md` e o `docs/agent_docs/backend/README.md`, na seção **Como usar**, e os docs
   das camadas que a tarefa toca.
2. Leia o código atual das camadas envolvidas. Não leia código antigo apagado (`git show`).
3. Ache o que já existe para reaproveitar: helpers em `lib/`, o plano de falha dos usecases,
   `isDebug()` no front, o `Envolviment` etc.
4. **Dúvidas pelo `AskUserQuestion`, uma por chamada**, com opções e a recomendada primeiro. Nada
   de lista de perguntas no texto.
5. **O que a Bea descreveu é a solução.** Se uma regra do padrão parecer conflitar, aponte e
   pergunte antes. Não troque por outra ideia.

## 2. O rascunho (plano no modo plano)

O rascunho tem **só tipos e assinaturas**: classes, interfaces, métodos com entrada e saída,
rotas, tabelas. **Nunca corpo de código.** Antes de entregar, conte as linhas de código; se
houver corpo, corte.

Seções, nesta ordem:

| Seção | O que tem |
|---|---|
| **Contexto** | o problema, o que pediu a mudança e o resultado esperado |
| **Desenho** | ASCII do fluxo (rota → injetor → usecase → repo → client) e as escolhas com o porquê |
| **Assinaturas** | arquivo + assinatura por camada (domain, interface, client, repo, usecase, rota) |
| **Rotas / Banco / Front** | tabela de rotas; migration `vN__*.sql` (banco mínimo: ids em coluna, resto em `jsonb`, sem função SQL); o que muda na tela |
| **Ondas** | tabela onda × quem × escopo |
| **Verificação** | `tsc`, `check.cjs` e o roteiro manual que a Bea vai testar |

Regras que o rascunho já respeita:

- **O usecase recebe um objeto de domínio, ou um command que tem domínio.** Isso é absoluto no
  `CLAUDE.md`. Corpo de rota vira domain no `*Request.toDomain`.
- **Um usecase por contexto** (`booking/`, `event/`, `sync/`, `job/`). Código parecido entre
  contextos não é duplicação. Contexto novo só com a Bea de acordo.
- **A rota pede o usecase ao injetor:** `await Envolviment.make<X>(X.token)`, numa variável com o
  nome do usecase. Usecase novo pedido por rota ganha `token` e um `case`.
- **A UX é do dev do front:** telas e textos ficam como estão, e só o que é novo muda. Controle de
  diagnóstico fica atrás do `isDebug()` (`?debug=1`).
- **Arquivos de código novos** levam o nome da classe (`IntegrationSetting.ts`), nada de
  kebab-case.

## 3. Os três documentos (onda 1, feita pelo orquestrador)

Assim que o plano é aprovado, o orquestrador escreve os docs e faz o commit **antes** do código.

### Spec: `docs/spec/fase-<N>.md`

O que foi decidido e muda no técnico. Para tarefa da fase atual, vira uma seção nova dentro de
"Como ficou". Fase nova segue o formato da `fase-1.md`.

- Tabelas de regras com id (`| K1 | … |`), uma tabela por assunto: rotas, formato, banco, injeção,
  job, front (`F<n>`).
- Regra que muda uma já escrita é editada no lugar, como uma linha nova `J0` ou a `V1` com
  `await`. Não se acumula "antes/depois".
- No topo, `> **Concluído em <AAAA-MM-DD>.**` quando a fase fecha.

### Plano: `docs/plans/back/fase-<N>.md` (e `front/` quando a tela muda)

Praticamente o PRD: histórias **"Como <papel>, quero …"**. Cada uma lista o que foi **Criado**, o
que foi **Alterado** e o que **Já existia**, por camada, com uma descrição curta e link para o
arquivo.

- Changelog no `README.md` da pasta, com **Adicionadas**, **Alteradas** e **Removidas**.
- Tarefa de infraestrutura ou arquitetura sem história de usuário (deploy, injetor, padrão) vai
  em `docs/plans/<tema>/README.md`, no molde do `docs/plans/deploy/README.md`: contexto, desenho
  em ASCII, estrutura de pastas, assinaturas, tabela por provedor ou cenário e pontos de atenção.
- Rota nova entra no plano **antes** do código (lista fechada, A4).

### Doc de usecase: `docs/usecases/<dominio>.md`

Para pessoas. Segue o modelo de `docs/usecases/README.md`:

```
## <o que faz, em português> (<NomeDaClasse>) — `<rota>`
**Telas.** · **Contexto.** · **Decisão.** (as regras que o sistema segue) · **Consequências.**
```

Não leva termo técnico (`null`, método, campo, classe de erro) nem separa o que é do Hormônios e
o que é do Transicionais. Usecase alterado tem a sua seção editada.

Se a regra do padrão mudou, atualize também `docs/agent_docs/backend/` e a skill `code-pattern`,
incluindo o `check.cjs` quando a regra puder ser conferida por script.

## 4. Execução em ondas

| Onda | Quem | O quê |
|---|---|---|
| 1 | orquestrador | docs (spec, plano, usecase, padrão) e commit |
| 2… | **subagente, um por vez** | código, com escopo de arquivos fechado no prompt |

O prompt do subagente:
- manda ler o `CLAUDE.md`, o README do backend, os docs das camadas e a spec da tarefa;
- proíbe commit, `yarn build`, `yarn dev`, migration e `git show` de código antigo;
- pede `yarn typecheck` e o `check.cjs` nos arquivos tocados, com a saída no relatório;
- diz para registrar dúvida não bloqueante em `docs/plans/back/<tema>-duvidas.md` e só parar se
  bloquear.

Entre as ondas, o orquestrador:
- revisa o diff;
- roda **só o `tsc`**. **Nunca `yarn build`**, que pode travar a máquina;
- confere o `check.cjs`;
- faz o commit.

## 5. Fecho da tarefa

1. Os docs de usecase vão para a Bea revisar. O commit final só sai depois do ok dela.
2. Leve as decisões que importam do arquivo de dúvidas para a spec e **remova o arquivo**.
3. Marque o doc de padrão ou a spec como `> **Concluído em <AAAA-MM-DD>.**`.
4. No resumo final: os commits, o que foi decidido, o que ficou de fora e o roteiro que a Bea
   testa. Inclua as rotas a chamar, o `?debug=1` e a migration que ela roda no Supabase.
5. Commit e push só quando a Bea pedir.

## Exemplos no repo

- **Arquitetura e infra:** `docs/plans/deploy/README.md`, que planeja o deploy por provedor (dev,
  Vercel e Cloudflare), os jobs e os limites.
- **Feature com injeção:** a chave que desliga o Transicionais:
  - spec `fase-2.md`, regras K1–K5, J0 e F15;
  - história em `plans/back/fase-2.md` e `plans/front/fase-2.md`;
  - usecases em `usecases/producao.md` e `usecases/sincronizacao.md`;
  - padrão em `agent_docs/backend/envolviment.md` (EV8).
