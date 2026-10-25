# Ensaio

> Atualizado em 2026-10-25 (fase 2).

## GetEvent — `GET /api/ensaio`

> [`usecases/get-event.ts`](../../../../src/serve-utils/usecases/get-event.ts)

**Contexto.** A tela pública precisa do ensaio e do estoque mesmo com o Transicionais fora.

**Decisão.**
- Lê o retrato do Supabase. Se ele é recente (≤ 5 min) e do Transicionais, responde sem chamar a API.
- Senão, chama o `RefreshCurrentEventUsecase` (criado no construtor, D10). Respondeu: relê e
  responde `stale: false`. Falhou: o último retrato com `stale: true` (R2).
- Responde o model `EventView` montado pelo `EventViewMapper` (`usecases/mappers/event-view.mapper.ts`:
  só grupos ativos, com as vagas dos models, o `stale` e o `fetchedAt` do retrato).

**Consequências.**
- A tela nunca fica sem ensaio se já houve uma leitura. Sem nenhum retrato e sem a API: 404.
- O front ainda não mostra o `stale` (onda 4).

## RefreshCurrentEvent — `GET /api/cron/event`

> [`usecases/refresh-current-event.ts`](../../../../src/serve-utils/usecases/refresh-current-event.ts)

**Contexto.** A rotina única que resolve o encontro atual e grava o retrato (R13, revista pela E2.7).
Usada pelo cron, por `GetEvent`, pela Produção e pelo webhook `event.updated` (quando o retrato
dele não dá para mapear, D35).

**Decisão.**
- O encontro atual é o primeiro Público da listagem de manager, de hoje em diante (E2.7). A escolha
  é do usecase: o repo só lista (`listPublicEventsFrom(today())`) e busca (`findPublicEvent`) (R12).
- Fora do ar (`UpstreamUnavailableError`) ou sem encontro: não mexe no retrato, registra um aviso no
  log e devolve `available: false`. Outra falha de fonte (`InfraError`) sobe como 500.
- Na primeira leitura sobre o retrato local da fase 1, leva as reservas ao dia novo com
  `migrar_fase1` e mapa vazio: as com instrumento viram só presença (E2.2, D15).
- Grava com `gravar_retrato` (trava por `externalId`, `version` e `vacanciesAt`). Devolve `changed`.

**Consequências.**
- Rodar duas vezes dá no mesmo. Trocar o encontro (reset do dev, "Encerrar ensaio") troca o retrato.
- Os ids de grupos e assistências são os do Transicionais: não há de-para.

## Conta das vagas e formatos de resposta — sem rota

> Models: [`models/current-event.ts`](../../../../src/serve-utils/models/current-event.ts). Mappers:
> [`event-view.mapper.ts`](../../../../src/serve-utils/usecases/mappers/event-view.mapper.ts),
> [`admin-summary.mapper.ts`](../../../../src/serve-utils/usecases/mappers/admin-summary.mapper.ts) e
> [`my-reservation.mapper.ts`](../../../../src/serve-utils/usecases/mappers/my-reservation.mapper.ts).

**Contexto.** As vagas aparecem no ensaio, no resumo da Produção e na validação de estoque do
`UpdateEvent`. A conta é regra do ensaio; a resposta junta o ensaio e as reservas (dois domínios).
Até a refatoração de 2026-10-25, as duas coisas ficavam em `usecases/event-summary.ts`, que deixou de
existir.

**Decisão.**
- A conta é dos models (`Group` e `Support`, com a base comum `Stock`), que recebem as reservas:
  `countTaken(attendances)` = `taken` do retrato + linhas `vou` locais `PENDING`; no retrato local, as
  linhas `vou` que não estão `REJECTED`. É a mesma conta da função `reservar`. `available` =
  `stockTotal` − ocupado, nunca < 0, `null` = sem limite; `soldOut` = não rotativo e `available === 0`;
  `isBelowReservations(capacity, attendances)` = não rotativo e abaixo do ocupado (D29).
- `CurrentEvent.goingAttendances` (as que contam), `findSupport` e `findStock` (o estoque pelo id da
  assistência: acessório ou o `instrumentSupportId` do grupo).
- A resposta é model (`models/`), montado por um mapper que só formata (U9): `EventViewMapper` →
  `EventView` (`<ensaio>`: `instruments[]` com os `accessories` que valem para cada um, E2.9, D22),
  `AdminSummaryMapper` → `AdminSummary` (`<resumo>`: `stock[]` de `StockItem`, instrumentos e depois
  acessórios, com `reservations`, e as presenças que contam, D30, D31; o `type` é o `SupportTypeKind`)
  e `MyReservationMapper` → `MyReservation` (`minhas-reservas`).

**Consequências.**
- Uma regra de vaga muda no model e na `reservar` ao mesmo tempo, ou a tela e a recusa divergem.
- A Produção valida o estoque com a mesma conta que a tela mostra.
