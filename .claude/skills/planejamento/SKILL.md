---
name: planejamento
description: Planeja uma tarefa do hormônios-garoa com foco em comportamento (BDD leve, visão de product hacking) e gera a tarefa (docs/plans/back|front/T<n>-<nome>.md), a spec (docs/spec/spec-<n>-<nome>.md) e a doc de usecase (docs/usecases/). Use para planejar uma tarefa, criar uma tarefa, salvar a spec e o plano, ou qualquer mudança em api/, src/serve-utils/, supabase/ ou nas telas. O padrão de código fica na skill code-pattern.
---

# Planejamento

Foco em **comportamento**: o que a pessoa quer fazer. Padrão de código é da skill `code-pattern`.

## Arquivos de uma tarefa

| Arquivo | O que tem |
|---|---|
| `docs/plans/back/T<n>-<nome>.md` (ou `front/`) | as histórias, no formato das fases |
| `docs/spec/spec-<n>-<nome>.md` | as regras (`A1`, `B1`…) e o desenho |
| `docs/usecases/<dominio>.md` | o bloco de cada usecase, para pessoas |

- Um arquivo por tarefa, sem pasta.
- `<n>` é o número da tarefa, em ordem crescente: mostra como o projeto evoluiu
  (índice em `docs/plans/README.md`).
- **O nome é dado por quem pede a tarefa.** Pergunte; não invente.
- Fase concluída não recebe tarefa nova.

## Tarefa (`plans/`)

O formato de `plans/back/fase-1.md`, `plans/back/fase-2.md` e `plans/front/fase-2.md` é o padrão
de ouro:

- Título `# Back — T<n>: <nome>` (ou `# Front — …`) e uma citação com os links para a doc de
  usecase e para a spec.
- **Camadas novas:** só quando a tarefa cria uma camada.
- Cada história é `## Como <papel>, quero <o que quer>`: alto nível, direto.
- Embaixo, curto: **Criado** / **Alterado** / **Já existia**, com link para o arquivo, e uma linha
  com o comportamento. Quanto mais curto, melhor. Exemplos de referência:
  - fase-1 "Como time, quero achar os erros nos logs";
  - fase-2 "Como time, quero achar as falhas do Transicionais nos logs".
- Em geral, uma história por tarefa. Se o texto crescer, é alerta para quebrar em mais tarefas.
  Avise na hora de puxar a tarefa.
- Changelog no `README.md` da pasta (**Adicionadas** / **Alteradas** / **Removidas**).

## Spec (`spec/`)

- O formato de hoje é o padrão de ouro: tabelas de regras por assunto.
- O id fica no nome do arquivo (`spec-3`). Dentro dele, as regras são letra do bloco de assunto
  + número: `A1`, `A2`, `B1`… (A–Z basta). Cada bloco é um pedaço de contexto que dá para citar
  sozinho. De fora, cita-se pelo arquivo: "spec-3 B2".
- `fase-1` e `fase-2` são o começo de tudo e continuam citadas pelo nome do arquivo, com as
  regras delas: "fase-2 T3", "fase-1 D2".
- O desenho do fluxo vai em ASCII.

## Doc de usecase (`usecases/`)

- O formato de hoje é o padrão de ouro: `## <o que faz> (<Classe>) — <rota>`, com **Telas**,
  **Contexto**, **Decisão** e **Consequências**, para pessoas, sem termo técnico.
- **Sem assinatura nem código.** Cada bloco de usecase tem **no máximo 20 linhas**.
- Tarefa grande: comece pela doc de usecase para ver as prioridades.
- Ela vai juntando o que a próxima sessão precisa. O que não terminou leva `(Em progresso)` no
  título; sai quando a tarefa é marcada "Concluído".

## Assinaturas

- **Não são salvas em nenhum arquivo.**
- Mostre na conversa e pergunte se pode seguir com elas.
- Até 30 linhas. Passou disso, mostre só o desenho, sem assinatura.

## Princípios (product hacking)

- A solução mais simples que resolve, no tamanho do projeto.
- O código fica organizado para a próxima mudança ser simples, sem prever o que ainda não existe.

Exemplos de escolha simples:
- uma key no `.env` para o webhook, sem JWT;
- a arquitetura usa alguns princípios do SOLID, conceitos do DDD e da arquitetura hexagonal ou
  limpa, sem seguir nenhuma à risca;
- salvar os dados como JSON (`jsonb`), com coluna só para ids e chaves de consulta.

## Fluxo

1. Ao fim de cada onda, só `tsc` e `check.cjs`. **Nunca `yarn build`**: pode travar a máquina.
2. Antes de commitar, atualize a doc de usecase para pessoas (`docs/usecases/`): o bloco de cada
   usecase que mudou, com o **Desenho** (a rota, o usecase, o que ele confere e as chamadas de repo,
   em alto nível, no formato do desenho da spec), e o "Retrato dos endpoints" do
   `docs/usecases/README.md` se uma rota mudou.
3. Só no final, pergunte como ficam o commit e o push.
