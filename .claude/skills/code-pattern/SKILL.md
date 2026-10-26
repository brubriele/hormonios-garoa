---
name: code-pattern
description: Padrão de código TypeScript das rotas em /api do bff-hormonios e das camadas em src/serve-utils/ (errors, models, interfaces, clients, lib, repos com responses/requests em zod, usecases), com enums, InfraError, logger e o script check.cjs que acha desvios do padrão. Use ao criar, alterar, revisar ou refatorar arquivos em /api ou src/serve-utils/, e para ler o contrato OpenAPI do Transicionais (docs/transicionais-api.json) por script ao integrar com a API dele. Não se aplica ao front (app.js, guias.js etc.).
---

# Padrão de código do BFF (/api)

O padrão está em `docs/agent_docs/backend/`, com um doc por contexto.

1. Leia `docs/agent_docs/backend/README.md` antes de escrever código.
2. Siga a seção **Como usar**, no início dele. Ela diz qual doc ler para cada camada e para cada
   tarefa, e em que ordem.
3. Ao terminar, faça o que está em **Ao terminar**, no mesmo README, incluindo o checklist e o
   `check.cjs` (abaixo).

## O padrão em uma tela

O detalhe está nos docs; isto é o que mais aparece na revisão da Bea:

- **Repo só faz I/O.** Regra de negócio (escolher, decidir pelo estado, orquestrar, plano de falha)
  é do usecase. Só transação e trava ficam no repo ou na função SQL (`repos.md` R12).
- **Domínio é `models/`.** O formato cru é o schema zod em `repos/<fonte>/responses/` e `requests/`
  (`toDomain`/`fromDomain`). O schema faz defaults e normalização; o `toDomain` só monta o model
  (`requests-responses.md`).
- **Regra de um domínio é método do model** (a conta das vagas: `group.available(attendances)`). A
  saída que junta models de domínios distintos é um **mapper** em `usecases/<contexto>/mappers/`, um por arquivo,
  que só formata e devolve um **model de saída** de `models/` (`EventView`, `CurrentEventSummary`), nunca
  interface solta (`usecases.md` U9).
- **Um enum por conceito:** o response usa o enum do model (`z.enum(SupportTypeKind)`), sem duplicar.
- **Enum, não texto** para conjunto fechado; **`InfraError` com key**, não `throw new Error`, para falha
  de fonte; **logger**, não `console.*`; **helper comum em `lib/`**, nunca repetido.
- se a saida de um mapper foi a mesma saida do usecase, então isso é uma model, um objeto de dominio


## Conferir o padrão (`check.cjs`)

```bash
node .claude/skills/code-pattern/scripts/check.cjs <arquivos ou pastas tocados>   # sem argumento: api/ e src/serve-utils/
```

Lista cada desvio com `arquivo:linha [regra]` e o doc da regra: `console`, `safe-parse`,
`response-fallback`, `throw-error`, `string-union`, `nullable-optional`, `raw-interface`,
`repo-mapper`, `repo-mapping`, `const-enum`, `duplicate-helper` e `mapper-location` (mapper fora de
`usecases/<contexto>/mappers/` ou mais de um por arquivo). Corrija os desvios dos arquivos que você tocou.
Uma exceção justificada leva `// check-ignore <regra>: motivo` na linha ou na de cima. O código fora
do piloto ainda tem desvios de legado: não os corrija fora do escopo da tarefa.

## Contrato do Transicionais

**É só referência, para a tradução.** O Hormônios tem o seu próprio contrato: as rotas `/api/*` e
os models de `src/serve-utils/`. O contrato do Transicionais **não** dita nomes, formatos nem rotas
do Hormônios. Ele serve para escrever os schemas de `repos/transicionais/responses/` e `requests/`,
que traduzem nas duas direções: o cru vira model do Hormônios no `toDomain`, e o model vira o corpo
da requisição no `fromDomain`.

1. **Nunca leia `docs/transicionais-api.json` com Read, cat ou grep.** Ele é grande demais. Use o
   script.
2. Comandos, rodados de qualquer pasta. `<rota>` pode ser só o fim do caminho. Se mais de uma rota
   termina igual, o script lista as candidatas.

   ```bash
   S=.claude/skills/code-pattern/scripts/contrato.cjs
   node $S rotas Convidado                 # tag | VERBO path | resumo (filtra tag, path e resumo)
   node $S detalhe guests/ticket           # token, papéis, regras, parâmetros e corpo
   node $S campos guests/ticket            # campos que a resposta traz
   node $S erros guests/ticket             # status | key | message de cada erro
   node $S detalhe config-day put          # o método vem depois da rota (padrão: get)
   ```

3. **Ordem para entender uma operação:** `rotas` para achar, `detalhe` para as regras, `campos`
   para a resposta e `erros` para as `key`.
4. **Contrato desatualizado:** peça um JSON novo à Bea. Ele é gerado no repo do Transicionais.


# regras
- **Ao terminar o código:** `yarn typecheck` e o `check.cjs` nos arquivos tocados. Os dois passam
  antes de entregar.
- **Sempre perguntar antes de rodar o `yarn build`.**
- **Refatoração não muda comportamento.** Antes de mexer, guarde a resposta das rotas afetadas
  (`curl … | jq -S 'del(.fetchedAt)' > antes.json`); depois, compare com `diff`. Se a rota lê o
  Transicionais, rode também o `yarn cron:event` para a leitura acontecer de verdade.
- **Spec junto com o código.** Toda entrega que muda `api/`, `src/serve-utils/` ou `supabase/`
  atualiza `docs/spec/back/fase-<N>.md` (cria a da fase, se não existir, no formato da
  `fase-1.md`) e a linha do changelog em `docs/spec/back/README.md`. Mudou o front: o mesmo em
  `docs/spec/front/`.
- **Doc de usecase.** Usecase criado ou alterado atualiza a seção dele no doc do domínio, em
  `docs/spec/back/usecases/<dominio>.md`, com a referência ao `.ts` do usecase. É um ADR curto, no
  modelo de `docs/spec/back/usecases/README.md`. 