---
name: code-pattern
description: Padrão de código TypeScript das rotas em /api do bff-hormonios e das camadas em src/serve-utils/ (errors, models, interfaces, clients, repos, usecases). Use ao criar ou alterar arquivos em /api ou src/serve-utils/. Não se aplica ao front (app.js, guias.js etc.).
---

# Padrão de código do BFF (/api)

O padrão está em `docs/agent_docs/backend/`, com um doc por contexto.

1. Leia `docs/agent_docs/backend/README.md` antes de escrever código.
2. Siga a seção **Como usar**, no início dele. Ela diz qual doc ler para cada camada e para cada
   tarefa, e em que ordem.
3. Ao terminar, faça o que está em **Ao terminar**, no mesmo README.


# regras 
- Primeiro escreve o código e depois roda o teste
- Sempre perguntar antes de rodar o yarn build 