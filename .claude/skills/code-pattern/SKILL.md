---
name: code-pattern
description: Padrão de código TypeScript das rotas em /api do bff-hormonios e das camadas em src/serve-utils/ (errors, models, interfaces, clients, repos, usecases). Use ao criar ou alterar arquivos em /api ou src/serve-utils/, e para ler o contrato OpenAPI do Transicionais (docs/transicionais-api.json) por script ao integrar com a API dele. Não se aplica ao front (app.js, guias.js etc.).
---

# Padrão de código do BFF (/api)

O padrão está em `docs/agent_docs/backend/`, com um doc por contexto.

1. Leia `docs/agent_docs/backend/README.md` antes de escrever código.
2. Siga a seção **Como usar**, no início dele. Ela diz qual doc ler para cada camada e para cada
   tarefa, e em que ordem.
3. Ao terminar, faça o que está em **Ao terminar**, no mesmo README.

## Contrato do Transicionais

**É só referência, para a tradução.** O Hormônios tem o seu próprio contrato: as rotas `/api/*` e
os models de `src/serve-utils/`. O contrato do Transicionais **não** dita nomes, formatos nem rotas
do Hormônios. Ele serve para o repo em `repos/transicionais/` traduzir nas duas direções: `IRaw*`
vira model do Hormônios no `mapper*`, e o model vira o corpo da requisição.

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
- Primeiro escreve o código e depois roda o teste
- Sempre perguntar antes de rodar o yarn build 