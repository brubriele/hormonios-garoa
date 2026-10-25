# Front — Fase 2: instrumentos e estoque vindos do Transicionais

> O que mudou em `app.js` e `index.html` na fase 2. O resto é o da [fase 1](fase-1.md).
> Plano: [`bff-fase-2.md`](../../plans/bff-fase-2.md) (E2.9). Rotas e erros: [`../back/fase-2.md`](../back/fase-2.md).
> Dúvidas em aberto: [`bff-fase-2-duvidas.md`](../../plans/bff-fase-2-duvidas.md).

## Visão geral

- A tela não cita o Transicionais (E2.3). Telas, textos e navegação são os da fase 1.
- O que muda é o formato dos dados: `GET /api/ensaio` traz `instruments[]` (cada um com os seus
  `accessories`) no lugar de `groups` e `supports`, e a Produção traz `stock[]` (D22).
- Saem as constantes `STRAP`/`BEATER`: os acessórios são os ids que vêm da API.

## Telas que mudaram

| Tela | O que muda |
|---|---|
| **02 Instrumentos** | Uma linha por item de `event.instruments`. Com `available: null` (sem limite), aparece só "disponíveis", sem número. O botão vira "Esgotado" e fica `disabled` quando `soldOut` é `true` (não mais quando `available` é 0: um rotativo com 0 continua reservável). |
| **Folha (`#reserve-dialog`)** | As duas caixas fixas (talabarte e baqueta) saem. O `#reserve-accessories` é montado com os `accessories` do instrumento: uma caixa "Preciso de <nome>" por acessório. Acessório com `soldOut` vem `disabled` e com "(esgotado)". |
| **03 Minhas reservas** | Os acessórios vêm de `accessories[].name`, juntos por " · ". Sem nenhum: "Sem acessórios". |
| **Produção, ESTOQUE** | Uma linha por item de `admin.event.stock` (instrumentos e depois acessórios). "<n> reservados · <available> disponíveis", ou "sem limite" com `available: null`. Sem limite (`stockTotal: null`): o número vira "—" e o `−`/`+` fica `disabled` (D20). A lista de nomes vem de `reservations[]` ("nome — pronome") e a coluna de opções, do `detail` de cada uma. |

## Regras que mudaram

| # | Regra |
|---|---|
| F3 | A folha confere `soldOut` do instrumento antes de chamar a API ("Este instrumento acabou de ficar esgotado."). Instrumento que não está em `instruments` conta como esgotado. |
| F6 | O estoque −/+ não passa de 0 e não fica abaixo de `reservations.length`, a não ser que o item seja `rotativo` (aí o BFF decide). O `PUT` manda `stocks: [{ id, stockTotal }]`, com o `id` do item de `stock[]` (D28). |
| F7 | Os acessórios marcados em `#reserve-accessories` viram `supportIds` (os `value` das caixas). O `groupId` da reserva é o `id` do instrumento. |

## Ação → rota

Iguais às da fase 1, com uma troca:

| Ação | Rota | Depois |
|---|---|---|
| Estoque − / + | `PUT /api/admin/ensaio` `{ stocks: [{ id, stockTotal }] }` | renderiza o `<resumo>` da resposta |

## Mensagem por `key`

Uma `key` nova:

| `key` | Toast | Além do toast |
|---|---|---|
| `ACCESSORY_SOLD_OUT_ERROR` | "Este acessório acabou de esgotar." | fecha a folha e recarrega (como o `SOLD_OUT_ERROR`) |

`RESERVATION_REJECTED_ERROR` e `UPSTREAM_UNAVAILABLE_ERROR` ainda não têm texto próprio: caem em "Não
foi possível concluir. Tente de novo.".

## O que falta (onda 4)

- **`stale`:** o front ignora `stale` e `fetchedAt`. O aviso "Informações podem estar
  desatualizadas." não existe.
- **Status do envio em "Minhas reservas":** o front ignora `sync` e `syncError`. Uma reserva
  `PENDING` ou `REJECTED` aparece igual a uma confirmada. E, como a linha `REJECTED` está em
  `mine`, "Confirmar presença" responde "Sua presença já está confirmada." sem chamar a API (F2).
- **Toast da reserva `PENDING`:** com `sync: "PENDING"`, o toast continua "Instrumento reservado.".
- **`UPSTREAM_UNAVAILABLE_ERROR` na Produção:** sem o texto "Não foi possível salvar agora. Tente
  de novo em instantes.".
