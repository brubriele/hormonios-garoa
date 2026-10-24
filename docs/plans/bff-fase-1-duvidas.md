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
| 11 | 3 | `GET /api/minhas-reservas` não devolve o e-mail. Para uma presença ganhar instrumento, a pessoa precisa digitar o mesmo e-mail. | A folha já vem com nome e pronome da reserva deste aparelho. O e-mail fica só em memória (`state.email`) e preenche a folha enquanto a aba estiver aberta. Depois de recarregar, a pessoa digita de novo. | |
| 12 | 3 | "Confirmar presença" quando este aparelho já tem reserva (com ou sem instrumento) daria `ALREADY_RESERVED_ERROR` (dúvida 8). | O front não abre a folha: mostra "Sua presença já está confirmada." e vai para Minhas reservas. | |
| 13 | 3 | O botão "Produção" abria sempre o login. Com o cookie `hg_admin` de 12 h, pedir a chave toda vez não faz sentido. | O botão vai para a Produção e chama `GET /api/admin/resumo`. O login só abre num 401, e a tela mostra "Entre com a chave da Produção." com um botão "Entrar". | |
| 14 | 3 | `.bottom-nav` tem `display:flex`, que anulava o `hidden`: a navegação aparecia mesmo com as reservas fechadas. | Entrou `.bottom-nav[hidden]{display:none!important}` no `styles.css`. Agora a navegação some com as reservas fechadas e enquanto o ensaio carrega. | |
| 15 | 3 | O "×" dos diálogos é um botão de submit: com os campos preenchidos, fechar a folha fazia a reserva; com os campos vazios, a validação não deixava fechar. | O "×" ganhou `formnovalidate`, e o handler só fecha o diálogo quando o `submitter` é o "×". | |
| 16 | 3 | Sem a view de presença, a navegação tinha "01 Presença, 02 Instrumentos, 03 Minhas reservas". | Renumerei: "01 Instrumentos", "02 Minhas reservas" (navegação e títulos das telas). | |
| 17 | 3 | Na Produção, a lista "Presenças" antes era só de presenças. Agora o resumo traz uma linha por pessoa, com ou sem instrumento. | A lista mostra todas as linhas `vou`, com o instrumento (ou "Sem instrumento") na segunda coluna. O contador "Reservas ativas" conta as que têm instrumento. Grupos inativos aparecem no estoque com "· inativo". | |
| 18 | 4 | Quem reserva de novo depois do "Não vou" reaproveita a linha (`on conflict`) e mantém o `created_at` antigo. Na lista de presenças da Produção, que é ordenada por `created_at`, a pessoa volta para a posição antiga. | Deixei assim. Para ir para o fim da lista, a ordem passaria a ser por `updated_at`. | |
| 19 | 5 | O passo 3 da função `reservar` (`EVENT_CHANGED`) foi pensado para "o ensaio mudou desde que a pessoa abriu a folha", mas o `POST /api/reserva` não recebe `dayKey`: o usecase lê o ensaio atual e passa o `dayKey` dele. Assim, quem abriu a folha antes de um "Encerrar ensaio" reserva no ensaio novo (se estiver aberto), e o `EVENT_CHANGED_ERROR` só aparece se o ensaio mudar entre a leitura e a função. | A spec do back descreve o código como está. Para valer o que o plano pensou, o front mandaria o `dayKey` do `GET /api/ensaio` no corpo da reserva. | |

## Para a Bea testar (onda 2)

- **Vercel e imports sem extensão:** as rotas importam `src/serve-utils/...` sem `.ts`, com
  `moduleResolution: bundler`. O `tsc` aceita, mas só o `vercel dev` ou um deploy confirmam que o
  builder da Vercel resolve. Se der erro de módulo não encontrado, é aqui.
- **Função `reservar`:** só foi revisada no código. A trava e o `SOLD_OUT` com dois pedidos ao mesmo
  tempo precisam do teste com o Supabase de dev.

## Verificação da onda 4 (sem Supabase)

A migration real roda num Postgres em memória (PGlite). As 8 rotas usam o `supabase-js` real com
um dublê do PostgREST, e o front roda num DOM falso (happy-dom).

- SQL: 32/32.
- Rotas: 70/70. A única falha, `entrar` com corpo `null` dando 500, foi corrigida no `readJson`.
- Front: 32/32.

**Falta confirmar no Supabase de dev / `vercel dev`:**
- dois pedidos ao mesmo tempo pela última vaga, para testar a trava `for update`;
- o rpc que devolve a linha com `.single()`;
- a consulta com `hg_users(*)` embutido;
- o upsert com `on_conflict=email`;
- os imports sem extensão no builder da Vercel.
