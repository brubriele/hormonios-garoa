# Hormônios da Garoa

## Backend (`/api` e `src/serve-utils/`)

Antes de criar ou alterar qualquer arquivo em `api/` ou `src/serve-utils/`, leia
`docs/agent_docs/backend/README.md` e siga a seção **Como usar**, no início dele. Ela diz qual doc
ler para cada camada e para cada tarefa.

O front (`app.js`, `guias.js`, `*.html`, `styles.css`) não segue esse padrão.

## Planos e specs

- **Planos** (`docs/plans/`): só contexto das decisões, não são regra de código. A regra do backend
  é o `docs/agent_docs/backend/`.
- **Specs** (o que já está implementado): `docs/spec/back/README.md` e `docs/spec/front/README.md`.

REGRA ABSOLUTA USECASE SÓ TEM ENTRADA DE OBJETO DE DOMINIO OU UM COMMAND QUE TBM TEM OBJETO DE DOMINIO