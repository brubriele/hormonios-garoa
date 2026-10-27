# Hormônios da Garoa

## Backend (`/api` e `src/serve-utils/`)

Antes de criar ou alterar qualquer arquivo em `api/` ou `src/serve-utils/`, leia
`docs/agent_docs/backend/README.md` e siga a seção **Como usar**, no início dele. Ela diz qual doc
ler para cada camada e para cada tarefa.

O front (`app.js`, `guias.js`, `*.html`, `styles.css`) não segue esse padrão.

## Planos e specs

- **Planos** (`docs/plans/`): o PRD, as histórias de cada fase e o changelog (`docs/plans/back/README.md` e
  `docs/plans/front/README.md`); não são regra de código. A regra do backend
  é o `docs/agent_docs/backend/`.
- **Specs** (`docs/spec/`): o que foi decidido que muda no técnico, uma por fase (`fase-1.md`, `fase-2.md`).
- **Usecases** (`docs/usecases/`): o que o sistema faz, para pessoas.

REGRA ABSOLUTA USECASE SÓ TEM ENTRADA DE OBJETO DE DOMINIO OU UM COMMAND QUE TBM TEM OBJETO DE DOMINIO