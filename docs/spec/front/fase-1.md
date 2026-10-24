# Front — Fase 1: o protótipo usa o BFF

> O que está implementado em `app.js`, `index.html` e `styles.css`.
> Plano: [`bff-fase-1.md`](../../plans/bff-fase-1.md). Rotas e erros: [`../back/fase-1.md`](../back/fase-1.md).
> Dúvidas em aberto: [`bff-fase-1-duvidas.md`](../../plans/bff-fase-1-duvidas.md).

## Visão geral

- Os dados vêm do BFF (`/api/*`). Nada fica no `localStorage`.
- Uma função `api(path, { method, body })` faz o `fetch` com JSON e `credentials: "same-origin"`.
  Em erro, lança `{ status, key, message }`. Sem rede, a `key` é `NETWORK_ERROR`; um 200 que não é
  JSON vira `INVALID_RESPONSE`.
- Estado em memória: `event` (ensaio), `mine` (minhas reservas), `admin` (resumo) e `email` (o
  último e-mail usado nesta aba, que não é salvo).
- `loadPublic` busca `GET /api/ensaio` e `GET /api/minhas-reservas` juntos. Roda no `init` e depois
  de cada ação.

## Telas

A experiência é a do protótipo. Só muda o que é novo: o campo e-mail, os estados de carregando e
erro e as mensagens das `key`. As telas são views por hash: `#home`, `#presence`, `#instruments`,
`#my-reservations` e `#admin`.

| Tela | O que mostra |
|---|---|
| **Home, reservas fechadas** | Data, hora e local; botão para as guias; link do WhatsApp só se `whatsappUrl` estiver preenchido. A navegação de baixo fica escondida. |
| **Home, reservas abertas** | Data, hora, local e o contador `goingCount`. Botões "Confirmar presença" (vai para `#presence`), "Escolher instrumento" e guias. |
| **01 Presença** ("Quem vem tocar?") | O formulário `#presence-form` com e-mail, nome e pronome, e o botão "Confirmar presença". A resposta aparece em `#presence-status`. Saiu a linha "ID DE PARTICIPANTE", porque o id do aparelho é `HttpOnly`. |
| **02 Instrumentos** | Uma linha por grupo ativo, com `available`. Com 0, o botão vira "Esgotado" e fica `disabled`. |
| **03 Minhas reservas** | As reservas deste aparelho. Com instrumento: o nome do grupo e os acessórios ("Talabarte · ", "Baqueta/maçaneta" ou "Sem acessórios"). Sem instrumento: "Presença confirmada" (dúvida 20). Cada linha tem o botão "Desfazer". |
| **Folha (`#reserve-dialog`)** | Só para instrumento: "RESERVA / <instrumento>", "Detalhes do instrumento.", e-mail, nome, pronome, talabarte e baqueta e "Reservar instrumento". |
| **Produção (`#admin`)** | Contadores (presenças e reservas ativas), abrir e fechar reservas, próximo ensaio, link do WhatsApp, estoque com −/+, lista de presenças (nome, pronome e data) e "Encerrar ensaio". |
| **Login da Produção** | Campo "Senha", sem dica. Abre pelo botão "Produção" e também quando o BFF responde 401. |

| # | Regra |
|---|---|
| F1 | Com as reservas fechadas, `#presence`, `#instruments` e `#my-reservations` voltam para `#home`. |
| F2 | "Confirmar presença" com uma reserva neste aparelho não chama a API: mostra "Sua presença já está confirmada." em `#presence-status`. |
| F3 | A folha abre pela linha de um instrumento. "Você já reservou este instrumento." e "Este instrumento acabou de ficar esgotado." são conferidos antes de chamar a API, como no protótipo. |
| F4 | A folha vem com o e-mail da aba e com o nome e o pronome da reserva deste aparelho (dúvida 11). |
| F5 | O "×" da folha e do login fecha sem enviar (`formnovalidate`). |
| F6 | Na lista de presenças da Produção entra cada linha `vou`, com ou sem instrumento. "Reservas ativas" conta só as linhas com instrumento. O estoque −/+ confere antes de chamar a API se ficaria abaixo das reservas (dúvida 17). |
| F7 | Os checkboxes viram `supportIds`: talabarte → `"talabarte"`, baqueta → `"baqueta"`. |

## Ação → rota

| Ação | Rota | Depois |
|---|---|---|
| Abrir a página | `GET /api/ensaio` + `GET /api/minhas-reservas` | renderiza tudo |
| Confirmar presença | `POST /api/reserva` com `groupId: null` e `supportIds: []` | recarrega. `#presence-status`: "Presença confirmada. Agora você pode escolher um instrumento." |
| Reservar instrumento | `POST /api/reserva` | fecha a folha, recarrega e vai para Minhas reservas. Toast "Instrumento reservado." |
| "Desfazer" | `POST /api/reserva/desfazer` `{ id }` | recarrega. Toast "Reserva desfeita. O instrumento voltou ao estoque." ou, sem instrumento, "Reserva desfeita." |
| Abrir a Produção | botão "Produção" → login; `#admin` → `GET /api/admin/resumo` | renderiza a Produção; num 401, abre o login |
| Entrar | `POST /api/admin/entrar` `{ key }` | vai para `#admin` e busca o resumo. Senha errada: "Senha incorreta." |
| Salvar ensaio | `PUT /api/admin/ensaio` `{ date, time, location }` | toast "Dados do ensaio atualizados." |
| Salvar link | `PUT /api/admin/ensaio` `{ whatsappUrl }` | toast "Link do grupo atualizado." |
| Abrir/fechar reservas | `PUT /api/admin/ensaio` `{ bookingOpen }` | ao fechar, vai para a home. Toasts do protótipo |
| Estoque − / + | `PUT /api/admin/ensaio` `{ groups: [{ id, stockTotal }] }` | não passa de 0 |
| Encerrar ensaio | `POST /api/admin/novo-ensaio` (depois de um `confirm`) | vai para a home. Toast "Novo ensaio criado. Reservas estão fechadas." |

Toda ação da Produção usa o `<resumo>` da resposta para renderizar e depois chama `loadPublic`.

## Carregando e erro

| Situação | O que aparece |
|---|---|
| Ensaio carregando | "Carregando…" na home, nas listas e na Produção. A navegação de baixo fica escondida. |
| Ensaio ou minhas reservas com erro | "Não foi possível carregar o ensaio." (ou os instrumentos, ou suas reservas), com "Tentar de novo", que chama `loadPublic` de novo. |
| Produção com erro (exceto 401) | "Não foi possível carregar a Produção." com "Tentar de novo". |
| Produção sem sessão | "Entre com a senha da Produção." com o botão "Entrar". |
| Ação em andamento | O botão fica `disabled` e com `aria-busy` até a resposta. |
| Ação com erro | Toast com a mensagem da `key` (tabela abaixo). |

## Mensagem por `key`

| `key` | Toast | Além do toast |
|---|---|---|
| `SOLD_OUT_ERROR` | "Este instrumento acabou de esgotar." | fecha a folha e recarrega |
| `ALREADY_RESERVED_ERROR` | "Este e-mail já tem reserva neste ensaio." | — |
| `BOOKING_CLOSED_ERROR` | "As reservas estão fechadas no momento." | fecha a folha, recarrega e vai para a home |
| `EVENT_CHANGED_ERROR` | "O ensaio mudou. Atualizamos a página." | fecha a folha e recarrega (e a Produção, se estiver nela) |
| `STOCK_BELOW_RESERVATIONS_ERROR` | "O estoque total não pode ficar abaixo das reservas atuais." | — |
| `INVALID_PARAMETER_ERROR` | "Confira os campos." | — |
| `UNAUTHORIZED_ERROR` | sem toast | limpa a Produção e abre o login. No login, a senha errada mostra "Senha incorreta." |
| outras (`NOT_FOUND_ERROR`, `INTERNAL_ERROR`, `NETWORK_ERROR`, `INVALID_RESPONSE`) | "Não foi possível concluir. Tente de novo." | — |

## O que saiu do protótipo

| Saiu | Ficou no lugar |
|---|---|
| `localStorage` (`hg_participant_id`, `hg_rehearsal`, `hg_instruments`, `hg_reservations`, `hg_attendance`) e as funções `get`/`set` | o BFF; o aparelho passa a ser o cookie `hg_device`, que o front não lê (`HttpOnly`) |
| `seedInstruments` no `app.js` | o seed da migration |
| `participantId`, `shortId`, `#participant-id-short` e a linha "ID DE PARTICIPANTE" | — (o id do aparelho é `HttpOnly`) |
| A senha `garoa` no código | a `ADMIN_KEY` no servidor e o cookie `hg_admin` de 12 h |
| A dica "a senha definida no ADR é garoa" no login | nada (por segurança) |
