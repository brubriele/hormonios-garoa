# Front — Fase 1: o protótipo usa o BFF

> O que está implementado em `app.js`, `index.html` e `styles.css`.
> Plano: [`bff-fase-1.md`](../../plans/bff-fase-1.md). Rotas e erros: [`../back/fase-1.md`](../back/fase-1.md).
> Dúvidas em aberto: [`bff-fase-1-duvidas.md`](../../plans/bff-fase-1-duvidas.md).

## Visão geral

- Os dados vêm do BFF (`/api/*`). Nada fica no `localStorage`.
- Uma função `api(path, { method, body })` faz o `fetch` com JSON e `credentials: "same-origin"`.
  Em erro, lança `{ status, key, message }`. Sem rede, a `key` é `NETWORK_ERROR`.
- Estado em memória: `event` (ensaio), `mine` (minhas reservas), `admin` (resumo) e `email` (o
  último e-mail usado nesta aba, que não é salvo).
- `loadPublic` busca `GET /api/ensaio` e `GET /api/minhas-reservas` juntos. Roda no `init` e depois
  de cada ação.

## Telas

As telas são views por hash: `#home`, `#instruments`, `#my-reservations` e `#admin`.

| Tela | O que mostra |
|---|---|
| **Home, reservas fechadas** | Data, hora e local; botão para as guias; link do WhatsApp só se `whatsappUrl` estiver preenchido. A navegação de baixo fica escondida. |
| **Home, reservas abertas** | Data, hora, local e o contador `goingCount`. Botões "Confirmar presença", "Escolher instrumento" e guias. |
| **01 Instrumentos** | Uma linha por grupo ativo, com `available`. Com 0, o botão vira "Esgotado" e fica `disabled`. |
| **02 Minhas reservas** | As reservas deste aparelho. Com instrumento: o nome do grupo e os acessórios. Sem instrumento: "Presença confirmada". Cada linha tem o botão "Não vou". |
| **Folha (`#reserve-dialog`)** | E-mail, nome, pronome e, só com instrumento, talabarte e baqueta. Uma folha para os dois casos (E1.5). |
| **Produção (`#admin`)** | Contadores (presenças e reservas ativas), abrir e fechar reservas, próximo ensaio, link do WhatsApp, estoque com −/+, lista de presenças e "Encerrar ensaio". |
| **Login da Produção** | Campo "Chave". Abre só quando o BFF responde 401. |

| # | Regra |
|---|---|
| F1 | Com as reservas fechadas, `#instruments` e `#my-reservations` voltam para `#home`. |
| F2 | A folha abre pela linha de um instrumento (com o grupo escolhido) ou por "Confirmar presença" (sem grupo). |
| F3 | "Confirmar presença" com uma reserva neste aparelho não abre a folha: mostra "Sua presença já está confirmada." e vai para Minhas reservas (dúvida 12). |
| F4 | A folha vem com o e-mail da aba e com o nome e o pronome da reserva deste aparelho (dúvida 11). |
| F5 | O "×" da folha e do login fecha sem enviar (`formnovalidate`). |
| F6 | O botão "Produção" vai direto para `#admin` e busca o resumo. O login só abre num 401 (dúvida 13). |
| F7 | Na lista de presenças da Produção, cada linha `vou` mostra o instrumento ou "Sem instrumento". "Reservas ativas" conta só as linhas com instrumento. Um grupo inativo aparece no estoque com "· inativo" (dúvida 17). |

## Ação → rota

| Ação | Rota | Depois |
|---|---|---|
| Abrir a página | `GET /api/ensaio` + `GET /api/minhas-reservas` | renderiza tudo |
| Enviar a folha | `POST /api/reserva` | fecha a folha, recarrega e vai para Minhas reservas. Toast "Instrumento reservado." ou "Presença confirmada. Agora você pode escolher um instrumento." |
| "Não vou" | `POST /api/reserva/desfazer` `{ id }` | recarrega. Toast "Reserva desfeita. O instrumento voltou ao estoque." ou "Presença desfeita." |
| Abrir a Produção | `GET /api/admin/resumo` | renderiza a Produção; num 401, abre o login |
| Entrar | `POST /api/admin/entrar` `{ key }` | busca o resumo de novo |
| Salvar ensaio | `PUT /api/admin/ensaio` `{ date, time, location }` | toast "Dados do ensaio atualizados." |
| Salvar link | `PUT /api/admin/ensaio` `{ whatsappUrl }` | toast "Link do grupo atualizado." |
| Abrir/fechar reservas | `PUT /api/admin/ensaio` `{ bookingOpen }` | ao fechar, vai para a home |
| Estoque − / + | `PUT /api/admin/ensaio` `{ groups: [{ id, stockTotal }] }` | não passa de 0 |
| Encerrar ensaio | `POST /api/admin/novo-ensaio` (depois de um `confirm`) | vai para a home. Toast "Novo ensaio criado. Reservas estão fechadas." |

Toda ação da Produção usa o `<resumo>` da resposta para renderizar e depois chama `loadPublic`.

## Carregando e erro

| Situação | O que aparece |
|---|---|
| Ensaio carregando | "Carregando…" na home, nas listas e na Produção. A navegação de baixo fica escondida. |
| Ensaio ou minhas reservas com erro | "Não foi possível carregar o ensaio." (ou os instrumentos, ou suas reservas), com "Tentar de novo", que chama `loadPublic` de novo. |
| Produção com erro (exceto 401) | "Não foi possível carregar a Produção." com "Tentar de novo". |
| Produção sem sessão | "Entre com a chave da Produção." com o botão "Entrar". |
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
| `UNAUTHORIZED_ERROR` | sem toast | limpa a Produção e abre o login. No login, a chave errada mostra "Chave incorreta." |
| outras (`NOT_FOUND_ERROR`, `INTERNAL_ERROR`, `NETWORK_ERROR`) | "Não foi possível concluir. Tente de novo." | — |

## O que saiu do protótipo

| Saiu | Ficou no lugar |
|---|---|
| `localStorage` (`hg_participant_id`, `hg_rehearsal`, `hg_instruments`, `hg_reservations`, `hg_attendance`) e as funções `get`/`set` | o BFF; o aparelho passa a ser o cookie `hg_device`, que o front não lê (`HttpOnly`) |
| `seedInstruments` no `app.js` | o seed da migration |
| `participantId`, `shortId` e `#participant-id-short` | — |
| A senha `garoa` no código | a `ADMIN_KEY` no servidor e o cookie `hg_admin` de 12 h |
| A view `#presence`, o `#presence-form` e o item "Presença" da navegação | a folha única com "Confirmar presença" na home. A navegação ficou "01 Instrumentos" e "02 Minhas reservas" (dúvida 16) |
