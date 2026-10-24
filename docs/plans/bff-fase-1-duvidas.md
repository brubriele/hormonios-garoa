# Dúvidas da implementação da fase 1

> Registradas durante as ondas de [`bff-fase-1-implementacao.md`](bff-fase-1-implementacao.md).
> Cada dúvida diz o que foi decidido para seguir. A Bea confirma ou troca depois.

| # | Onda | Dúvida | O que foi feito para seguir | Resposta da Bea |
|---|---|---|---|---|
| 1 | 2 | O seed do `app.js` tem data `2026-10-07` e hora `19:30`, que já passaram. Que data e hora o seed de `hg_current_event` usa? | Data e hora vazias (`""`), local "A definir", WhatsApp vazio e `bookingOpen: true`. A Produção preenche pelo `PUT /api/admin/ensaio`. | |
| 2 | 2 | `models.md` (M1) pede um model por arquivo, e o plano põe `CurrentEvent`, `Group` e `Support` em `current-event.ts`. | Segui o plano: as três classes em `models/current-event.ts`. **Tech lead:** aceito por enquanto (`Group` e `Support` só existem dentro do ensaio). Se a Bea aprovar, a M1 ganha essa exceção. | |
| 3 | 2 | Resumo, `PUT /api/admin/ensaio` e `novo-ensaio` devolvem o mesmo `<resumo>`, e `GET /api/ensaio` usa a mesma conta de vagas. Os docs não têm lugar para código compartilhado entre usecases. | Criei `usecases/event-summary.ts`, com os tipos de resposta e funções puras (`toEventView`, `toAdminSummary`, `countReservedByGroup`). Não é usecase. Se aprovado, entra em `usecases.md`. **Tech lead:** aceito por enquanto; não mudei `usecases.md` sem a Bea. | |
| 4 | 2 | As listas precisam de nome e pronome, que estão em `hg_users`. Onde ficam no model? | `Attendance` recebe o `User` no construtor (`attendance.user`). O repo faz `select("*, hg_users(*)")` e o tipo cru é `IRawAttendanceWithUser`. | |
| 5 | 2 | `INVALID_GROUP` (da função `reservar`) não tem `key` própria no contrato. | Vira `InvalidParameterError` (400 `INVALID_PARAMETER_ERROR`). | |
| 6 | 2 | O "Não vou" (`desfazer`) funciona com as reservas fechadas? | Funciona: o usecase não confere `bookingOpen`. Só exige que a linha seja deste aparelho e do `dayKey` atual. | |
| 7 | 2 | O `PUT /api/admin/ensaio` confere estoque ≥ reservas no usecase, fora da trava da função `reservar`. Uma reserva entre a leitura e a gravação pode deixar o estoque abaixo das reservas. | Deixei assim (a Produção raramente baixa o estoque enquanto há reservas chegando). Para ficar atômico, precisaria de outra função SQL. | |
| 8 | 2 | Quem já tem presença sem instrumento neste aparelho e pede presença de novo (sem `groupId`). | A função dá `ALREADY_RESERVED`: a exceção do passo 5 vale só quando o pedido traz um `groupId`. | |
| 9 | 2 | `ReserveUsecase` faz o upsert do usuário antes de `reservar`, então uma reserva recusada já teria trocado nome e pronome. | O usecase confere `bookingOpen` antes do upsert (a função confere de novo). Em `SOLD_OUT` e `ALREADY_RESERVED` o nome ainda é trocado. | |
| 10 | 2 | O `npm install -D typescript` instalou o TypeScript 7.0.2. | Mantive. O `tsconfig.json` não usa opções removidas no 7 (`baseUrl` etc.). | |

## Para a Bea testar (onda 2)

- **Vercel e imports sem extensão:** as rotas importam `src/serve-utils/...` sem `.ts`, com
  `moduleResolution: bundler`. O `tsc` aceita, mas só o `vercel dev` ou um deploy confirmam que o
  builder da Vercel resolve. Se der erro de módulo não encontrado, é aqui.
- **Função `reservar`:** só foi revisada no código. A trava e o `SOLD_OUT` com dois pedidos ao mesmo
  tempo precisam do teste com o Supabase de dev.
