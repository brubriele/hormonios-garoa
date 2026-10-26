# Produção

> Atualizado em 2026-10-25 (fase 2).

O login (`POST /api/admin/entrar`) não tem usecase: a rota usa `isAdminKey` e `createAdminCookie`
de [`http/admin-session.ts`](../../../../src/serve-utils/http/admin-session.ts). As outras rotas
chamam `requireAdmin` antes do usecase.

## FindingCurrentEventSummary — `GET /api/admin/resumo`

> [`usecases/event/finding-current-event-summary.ts`](../../../../src/serve-utils/usecases/event/finding-current-event-summary.ts)

**Contexto.** A tela da Produção: ensaio, estoque e presenças.

**Decisão.**
- Lê o retrato e as linhas do dia no Supabase e responde o model `CurrentEventSummary`, montado pelo
  `CurrentEventSummaryMapper` (`usecases/event/mappers/current-event-summary.mapper.ts`: `stock[]`, E2.9; as vagas vêm dos
  models).
- Não chama o Transicionais.

**Consequências.**
- O estoque é o do último retrato. `reservations` e `attendances` só trazem quem reservou pelo
  Hormônios e não está `REJECTED` (D30).

## UpdatingCurrentEvent — `PUT /api/admin/ensaio`

> [`usecases/event/updating-current-event.ts`](../../../../src/serve-utils/usecases/event/updating-current-event.ts)

**Contexto.** "Salvar ensaio", link, abrir/fechar e estoque, com a mesma tela da fase 1, repassados
ao Transicionais (E2.5).

**Decisão.**
- Valida o parcial. Com retrato local da fase 1, lê o Transicionais antes (senão 503).
- `stocks`: cada id é achado por `CurrentEvent.findStock` (desconhecido ou sem limite: 400). Só os
  que mudaram vão adiante, conferidos por `isBelowBookings(capacity, attendances)` do model
  (rotativo pula; abaixo do ocupado: 409, D29) e gravados com `PUT manager-support-types/{id}`
  (objeto inteiro, `SupportType.withCapacity`, E2.9, D26).
- Local, data, hora e abertura: só a diferença vai ao Transicionais (D1, D7). O encontro de manager
  sai de `findManagedEvent(ref, today())`: a data de busca é do usecase (R12). Data nova move as
  linhas para o dia novo como `PENDING`.
- `EVENT_VERSION_CONFLICT` chega como `VersionConflictError` (`InfraError`): o usecase relê a
  `version` e tenta uma vez mais; repetiu, 500.
- Estoque com o Transicionais fora, ou com uma `PENDING` da mesma assistência (para valer a ordem):
  `savePendingCapacity` (`estoque_pendente`) enfileira e grava o retrato com o valor novo
  (`CurrentEvent.withStock`). Sem releitura, porque ele está fora (D53).
- Encerramento pendente (`findOpenNextEvent`, D51): o retrato local é a verdade; só estoque e
  `whatsappUrl` mudam. Data, hora, local ou abertura: 503.
- `whatsappUrl` grava local (`gravar_whatsapp`). Por fim, relê o retrato e responde o resumo pelo
  `CurrentEventSummaryMapper`.

**Consequências.**
- Não é atômico: um estoque pode ser gravado e a edição do encontro falhar. Repetir é seguro (D12).
- Fora do ar: o estoque vai para a fila; data, hora, local e abertura dão 503 `UPSTREAM_UNAVAILABLE_ERROR`.

## CreatingNextEvent — `POST /api/admin/novo-ensaio`

> [`usecases/event/creating-next-event.ts`](../../../../src/serve-utils/usecases/event/creating-next-event.ts)

**Contexto.** "Encerrar ensaio" cria o próximo encontro no Transicionais (E2.5, E2.7).

**Decisão.**
- Encerramento anterior ainda aberto (`findOpenNextEvent`): `NEXT_EVENT_PENDING_ERROR` (409, D51).
- A data do próximo é a do retrato + 7 dias. Acha o encontro com `findManagedEvent(ref, <data do
  retrato>)`, cria (mesmo horário, grupos, assistências e limites, fechado; falhou depois do POST,
  apaga o recém-criado, D16) e lê o retrato do novo. A criação também existe no
  `SyncingNextEventPending` (cron): cada contexto tem a sua cópia (U11). Grava com
  `saveSnapshot`, com o estoque pendente por cima (`withPendingCapacities`, D53). O antigo fica no
  Transicionais, sem mudança: o `ReceivingCurrentEvent` segue o encontro do retrato enquanto ele
  estiver na listagem.
- Transicionais fora (`UpstreamUnavailableError`, mesmo no meio da criação): `closeEventLocally`
  (`encerrar_local`) troca o retrato pelo próximo só no local (`CurrentEvent.next`: dia local UUID,
  sem `externalId`, fechado) e enfileira o `NEXT_EVENT`. O cron o cria lá (D51).
- Responde o resumo pelo `CurrentEventSummaryMapper`, sem presenças.

**Consequências.**
- O resumo volta sem presenças. As linhas antigas ficam no `dayKey` anterior (histórico).
- O antigo continua Público no Transicionais (as presenças ficam nele). Se só o `saveSnapshot`
  falhar, o novo fica criado lá e o retrato continua no antigo: um novo "Encerrar" cria outro.
- Se o POST chegou a criar o encontro antes da queda e o delete (D16) não passou, ele fica Interno lá
  (não aparece na listagem de Públicos) e o cron cria outro.
