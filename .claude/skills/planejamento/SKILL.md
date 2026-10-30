---
name: planejamento
description: Planeja uma tarefa do hormônios-garoa com foco em comportamento (BDD leve, visão de product hacking) e gera a tarefa (docs/plans/back|front/T<n>-<nome>.md), a spec (docs/spec/spec-<n>-<nome>.md) e a doc de usecase (docs/usecases/). Use para planejar uma tarefa, criar uma tarefa, salvar a spec e o plano, ou qualquer mudança em api/, src/bff/, supabase/ ou nas telas. O padrão de código fica na skill code-pattern.
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
- **Ordem da dependência:** planeje e escreva na ordem Repository → Usecase → API → Front. A spec
  do front vem por último, depois que a API está decidida.

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
- **Roadmap (no final da tarefa):** a tarefa diz a qual seção do Roadmap do `README.md` ela se liga, o que atende, o
  que não atende e as issues do GitHub ligadas. O que não atende e não tem issue vira proposta de
  issue nova, para quem pede a tarefa decidir. Item `[ ]` pode ser "existe, mas está errado".

## Spec (`spec/`)

- O formato de hoje é o padrão de ouro: tabelas de regras por assunto.
- O id fica no nome do arquivo (`spec-3`). Dentro dele, as regras são letra do bloco de assunto
  + número: `A1`, `A2`, `B1`… (A–Z basta). Cada bloco é um pedaço de contexto que dá para citar
  sozinho. De fora, cita-se pelo arquivo: "spec-3 B2".
- `fase-1` e `fase-2` são o começo de tudo e continuam citadas pelo nome do arquivo, com as
  regras delas: "fase-2 T3", "fase-1 D2".
- O desenho do fluxo vai em ASCII.
- **Durante o desenvolvimento,** a spec leva `Em progresso` e uma seção de dúvidas. **Ao final,**
  fica só a versão final: saem as dúvidas e o `Em progresso`.

## Doc de usecase (`usecases/`)

- O formato de hoje é o padrão de ouro: `## <o que faz> (<Classe>) — <rota>`, com **Telas**,
  **Contexto**, **Decisão** e **Consequências**, para pessoas, sem termo técnico.
- **Sem assinatura nem código.** Cada bloco de usecase tem **no máximo 20 linhas**.
- O **Desenho** é um ` ```mermaid ` gerado pela skill `sequence-diagram` e não conta no limite.
- **Ordem de dependência no arquivo:** o usecase usado por outro vem antes. Quem usa não repete o
  desenho dele: linka a etapa ("acima", ou o arquivo do outro domínio).
- **Um bloco por caminho:** se o mesmo usecase tem caminhos com regras diferentes (ex.: confirmar
  presença e reservar instrumento), cada caminho é um bloco, com o próprio desenho.
- Tarefa grande: comece pela doc de usecase para ver as prioridades.
- **Os blocos atuais ficam intactos** enquanto a tarefa não termina: eles descrevem o que o
  sistema faz hoje.
- O que a tarefa muda vai **no final do arquivo**, numa seção separada com o nome das tarefas:

  ```
  ------- EM PROGRESSO T8-<nome>, T9-<nome> -------
  ```

  Ali ficam os blocos novos ou alterados, no mesmo formato.
- Quando a tarefa é marcada "Concluído", os blocos de "EM PROGRESSO" substituem os atuais e a
  seção sai.

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
   usecase que mudou, com o **Desenho** (gerado pela skill `sequence-diagram`), e o "Retrato dos endpoints" do
   `docs/usecases/README.md` se uma rota mudou.
3. Só no final, pergunte como ficam o commit e o push.
