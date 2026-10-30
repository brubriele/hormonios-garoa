# spec-8 — hormonios-repo-otimization-event-read-for-event-and-users-attendance

> **Concluído em 2026-10-30.** Tarefa:
> [`plans/back/T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md`](../plans/back/T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md).
> Muda a fase-1 D2 (o evento atual) e a D16 (as presenças da pessoa). D5–D7 e E1 foram mudadas depois
> pela [spec-9](spec-9-identifying-user.md).

## Desenho

```
 ESTADOS DA current_event                     [evento | isActive | nextEventId | isCurrent]

 criar B (sem evento)  [B | false | null | true]
 liberar B             [B | true  | null | true]
 fechar B              [B | false | null | true]
 criar próximo A       [B | false | A    | true ] ──► [A | false | null | false]
 encerrar B (troca)    [B | false | A    | false] ──► [A | false | null | true ]
 liberar A             [B | false | A    | false] ──► [A | true  | null | true ]

 GETS (um por lado, reaproveitado)

 ensaio   FindingInternalEventUsecase(FindingInternalFilter)
            current_event ─1:1─► event ─1:n─► attendance (left) ─n:1─► user      1 query
            ◄── FindingPublicEventUsecase, UpdatingInternalEventUsecase

 pessoa   FindingUserBookingUsecase
            findCurrentEvent + findUserById(id, event)                            2 queries
            findUserById: user left join attendance (eventId) where user.id      1 query
            ◄── CreatingOrUpdatingAttendanceUsecase
```

## A. Modelo da current_event

| # | Regra |
|---|---|
| A1 | Tabela `current_event`: `id`, `"eventId"` (fk `event`, único), `"isActive"`, `"isCurrent"`, `"nextEventId"` (fk `event`, null), `created_at`, `updated_at`. Uma linha por evento. |
| A2 | Índices parciais únicos `where "isActive"` e `where "isCurrent"`: no máximo um aberto e um atual. |
| A3 | **ATUAL** é `isCurrent = true`. **PRÓXIMO** é o fim da lista (`nextEventId` null) com `isCurrent = false`. Reservas abertas é `isActive = true`. |
| A4 | Estados: ATUAL aberto (`true`, null, `true`), ATUAL fechado (`false`, null, `true`), ATUAL com próximo (`false`, A, `true`), PRÓXIMO (`false`, null, `false`). O projeto trata só o atual e o próximo. O histórico de ensaios é do Transicionais; se vier para cá, será desenhado à parte. |
| A5 | O estado não volta. O ensaio tem data, então sempre se cria um evento novo, que entra como PRÓXIMO. |
| A6 | Sem seed. Os eventos que já existem são dados perdidos de dev. |

## B. Escrita da current_event

| # | Regra |
|---|---|
| B1 | Toda atualização passa pela função SQL `update_current_event("eventId", "isActive", "isCurrent", "nextEventId")` (parâmetros em camelCase, sem prefixo). Ela trava a linha atual (`for update`) para evitar concorrência, e null quer dizer "não enviou". A função não valida transições: a regra fica no usecase (R12). |
| B2 | Liberar e fechar valem sempre para o atual: `(atual, true, null, null)` e `(atual, false, null, null)`. O atual se mantém. |
| B3 | A troca é o "Encerrar ensaio e criar próximo", e só ele muda o atual: B perde `isActive` e `isCurrent`, e A ganha `isCurrent`, com `isActive = false`, numa transação só: `(A, null, true, null)`. Endpoint próprio: `POST /api/admin/ensaio/proximo` (`ActiveNextEventUsecase`), sem body. Não recebe o ensaio: o usecase pega o `currentEvent` e o próximo dele (`nextEventId`). O próximo precisa existir: sem ele, recusa, e a Produção cria o próximo antes (B4). Sem atual ou sem próximo, responde 404 `NOT_FOUND_ERROR`. |
| B4 | Criar a linha é um método próprio do repo (insert simples), separado do `createEvent`. Salvar na aba PRÓXIMO cria o próximo: a linha de A com `isActive = false`, `nextEventId` null e `isCurrent = false` (é isso que faz dele o próximo e não o atual), depois `(B, null, null, A)` aponta o atual para A. Com um próximo já criado, criar outro é recusado (409 `NEXT_EVENT_EXISTS_ERROR`), antes de gravar: salvar a aba PRÓXIMO edita o que existe (`PUT`). |
| B5 | Sem evento nenhum, o `createMockEvent` (estado vazio, `emptyState.json`) cria o evento e, pelo método de B4, a linha dele como ATUAL. Vale para `GET /api/admin/ensaio` e `GET /api/ensaio`. Sai a cópia do último evento do Transicionais. O evento sincroniza ao salvar, e o job sincroniza se falhar. |
| B6 | `CURRENT_EVENT_NOT_FOUND` (raise da função) entra no `SQL_ERRORS` (R9). Vira o `NotFoundError` (404). |
| B7 | **Endpoint `PUT /api/admin/reservas`** (`BookingAvailabilityUsecase`), com o body `{ isActive: true \| false }` (liberar ou fechar). Não recebe o ensaio: o usecase pega o `currentEvent` para manter o estado válido e chama a função de B1 (B2). A rota monta um `Event` mínimo só com o `isActive` do body. Responde 200 com o ensaio atual. |

## C. bookingOpen

| # | Regra |
|---|---|
| C1 | `bookingOpen` = `current_event.isActive`. O domain `Event` ganha o campo `isActive`, lido da `current_event`. |
| C4 | O `CreatingInternalEventUsecase` cria sempre com `isActive = false`, como hoje, e isso vale também para o `createMockEvent`. O `bookingOpen` do `emptyState.json` não vale mais. |
| C2 | Escrita: só o endpoint novo de liberar e fechar. `bookingOpen` sai do body de `PUT` e do `POST /api/admin/ensaio`. |
| C3 | Leitura: `GET /api/ensaio` e `GET /api/admin/ensaio` continuam respondendo `bookingOpen`, com o valor vindo de `isActive`. O `validateBookingOpen` da reserva olha `isActive`. |

## D. Leituras

| # | Regra |
|---|---|
| D1 | Get do ensaio: `FindingInternalEventUsecase`, com uma query `current_event` → `event!eventId` → `attendance` (left, todas) → `user`. Sai o `findEventUsers`. Quem filtra é o usecase. |
| D2 | O `FindingInternalEventUsecase` recebe o `FindingInternalFilter` (objeto de domínio, regra do CLAUDE.md), que escolhe qual ensaio (D10): um get por vez. A aba ATUAL / PRÓXIMO usa o filtro. Na rota: `GET /api/admin/ensaio?posicao=atual\|proximo` (sem a query, atual; valor desconhecido, 400). Próximo não criado, 404. |
| D3 | O `FindingPublicEventUsecase` (`GET /api/ensaio`) e o `UpdatingInternalEventUsecase` (`PUT /api/admin/ensaio`) usam o get de D1, e o código de leitura duplicado sai deles. O Updating deixa de fazer `findEvent` + `findEventAttendance` + `findEventUsers`. A conta das vagas fica como está. |
| D4 | `findUser({ id, event })` (antes `findUserById(id, event)`) é uma query só: `user` left join `attendance` (`userId` e `eventId` do evento) `where user.id`. Pessoa sem presença no ensaio volta com `[]`. |
| D5 | Get da pessoa: `FindingUserBookingUsecase` (`GET /api/membros`) = `findCurrentEvent` + `findUser({ id, event })` de D4: 2 chamadas (hoje 3). Logada sem presença no atual, a resposta é `200` com a pessoa e `attendances: []`, como hoje. **Mudada pela spec-9.** |
| D6 | O `CreatingOrUpdatingAttendanceUsecase` (`POST` e `PATCH /api/membros/reservas`) usa a mesma leitura de D5 (`findCurrentEvent` + `findUser({ id, event })` pelo `FindingUserUsecase`), e o código de leitura duplicado sai dele. As vagas são contadas em memória com todas as presenças do ensaio. **Mudada pela spec-9.** |
| D7 | O `FindingUserUsecase.findCookieUser` usa o `findUser({ id, event })` de D4, sem a segunda ida às presenças. Ele continua recebendo o evento. **Mudada pela spec-9.** |
| D8 | Ensaio sem presença vem com `attendance: []`: o join com `attendance` é left (embed sem `!inner`). |
| D9 | **Um get por entidade no repo, com filtro nomeado:** `findEvent({ id \| integrationId \| transicionaisDayId \| attendanceId })`, `findUser({ id \| email \| integrationId, event? })` e `findAttendance({ event, id \| integrationId })`. Saem `findEventBy*`, `findUserBy*`, `findUserById` e `findAttendanceByIntegrationId`. O `findCurrentEvent(FindingInternalFilter)` continua, porque devolve o evento com as pessoas. |
| D10 | O `FindingInternalFilter` tem parâmetros nomeados: `{ position }`, `{ eventId }` ou `{ integrationId }`. O `UpdatingInternalEventUsecase` acha o encontro pelo `eventId`, ou pelo `integrationId` quando vem do webhook, sem olhar o atual. |

## E. Par CRUD

| # | Regra |
|---|---|
| E1 | A escrita usa o get do seu par para decidir se atualiza, e para de ler do repository: `CreatingOrUpdateUserUsecase` lê a pessoa pelo `FindingUserUsecase`, e a escrita da presença usa o get de D5. Com os gets otimizados, as leituras extras somem sozinhas. **Mudada pela spec-9.** |

## G. Rotas em português, no padrão REST

| # | Regra |
|---|---|
| G1 | As rotas ficam em português e no padrão REST: o método diz a ação. |
| G2 | `POST /api/admin/novo-ensaio` → `POST /api/admin/ensaio` (cria o próximo). `GET` e `PUT /api/admin/ensaio` continuam. |
| G3 | `GET /api/minhas-reservas` → `GET /api/membros`; `POST /api/reserva` → `POST /api/membros/reservas`; `POST /api/reserva/desfazer` → `PATCH /api/membros/reservas`. |
| G4 | Novas: `PUT /api/admin/reservas` (B7) e `POST /api/admin/ensaio/proximo` (B3). |
| G5 | Continuam: `GET /api/ensaio`, `POST /api/admin/entrar`, `POST /api/webhooks/transicionais`, `GET /api/cron/sync`. |
| G6 | O `app.js` passa a chamar as rotas novas. |

## Fora do escopo

- Job e sync.
- Encerramento automático do ensaio: [issue #19](https://github.com/brubriele/hormonios-garoa/issues/19).

## Front — T8

Tarefa: [`plans/front/T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md`](../plans/front/T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md).
As telas e os textos são os de hoje. A UX é do time front: só o novo muda.

| # | Regra |
|---|---|
| F1 | **Aba ATUAL / PRÓXIMO.** Na Produção, o título "PRÓXIMO ENSAIO" (`app.js:515`) vira **ENSAIO**, seguido das abas **ATUAL / PRÓXIMO**. O mesmo formulário (dados, estoque, presenças) carrega o ensaio da aba escolhida, pelo filtro de D2. A home pública não muda. |
| F2 | **Liberar e fechar.** O botão "Liberar/Fechar reservas" (`app.js:593`) chama `PUT /api/admin/reservas` (B7), e não mais o `PUT /api/admin/ensaio` com `bookingOpen`. |
| F3 | **Sem `bookingOpen` na escrita.** O `POST /api/admin/ensaio` (`app.js:628`) e o `PUT /api/admin/ensaio` deixam de mandar `bookingOpen` (C2). A leitura continua com `bookingOpen` (C3). |
| F4 | **PRÓXIMO ainda não criado.** A aba PRÓXIMO mostra o formulário vazio, já preenchido no front a partir do atual: a data do atual + 7 dias, o mesmo horário e o mesmo local. Salvar cria o próximo (`POST /api/admin/ensaio`). |
| F5 | O botão "Encerrar ensaio e criar próximo" (MANUTENÇÃO, `app.js:551`) mantém o texto e faz a troca (B3). |

