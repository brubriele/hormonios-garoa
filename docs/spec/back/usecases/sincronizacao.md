# Sincronização

> Atualizado em 2026-10-26 (fase 2, com a fila da Produção: D51–D53).

## `GET /api/cron/sync?type=<contexto>`

> [`api/cron/sync.ts`](../../../../api/cron/sync.ts)

**Contexto.** O que ficou pendente no local (Transicionais fora, lento ou ocupado) precisa chegar lá
depois, sem duplicar: o próximo ensaio e o estoque da Produção (D51–D53) e as reservas.

**Decisão.**
- Um usecase por contexto (U11), escolhido pelo `type`: `nextEvent` (`SyncingNextEventPending`),
  `stock` (`SyncingStockPending`) e `booking` (`SyncingBookingPending`). Sem `type` ou outro valor:
  400 `INVALID_PARAMETER_ERROR`. À mão: `yarn cron:sync --type=nextEvent`.
- Cada um responde a contagem do que tentou: `{ claimed, synced, rejected, pending, manualRetry }`
  (`pending` = continua na fila e o cron tenta de novo mais tarde; `manualRetry` = 400, 409 ou 422,
  D50). `claimed: 0` = nada a enviar.
- As reservas não vão enquanto o retrato for local (encerramento pendente): esperam o `nextEvent`.

**Consequências.**
- Ninguém chama a rota sozinho até existir o Worker (onda 4); ele chama um `type` por disparo.

## SyncingNextEventPending — sem rota

> [`usecases/sync/syncing-next-event-pending.ts`](../../../../src/serve-utils/usecases/sync/syncing-next-event-pending.ts)

**Contexto.** O "Encerrar" feito com o Transicionais fora fica na fila (`NEXT_EVENT`, D51).

**Decisão.**
- `claim_escritas('NEXT_EVENT', 1)` (há um aberto por vez). Tenta criar o próximo no Transicionais:
  acha o encerrado com `findManagedEvent(ref, fromDate)` (vale mesmo depois do dia passar) e cria o
  encontro, o ciclo, os grupos, o dia (horário do encerrado) e o público, fechado (D2). Falhou depois
  do POST: apaga o recém-criado (D16). O encerrado sumiu da listagem: `MANUAL_RETRY`.
- Conseguiu: grava o retrato do novo (com o estoque pendente por cima) e entrega o resto às filas,
  sem enviar nada. As reservas do dia local recebem o dia de lá e ficam `PENDING` (`moveBookings`,
  mapa identidade), e o `type=booking` as envia. O estoque é da assistência (`supportId`), não do
  encontro: já está na fila de stock com o id certo.
- Fora do ar ou outra falha: `BACKOFF`. 400, 409 ou 422: `MANUAL_RETRY` com o erro como veio (D50).
  Grava com `marcar_escrita`. Responde a contagem. `type=nextEvent`.

**Consequências.**
- Se o encontro for criado e a gravação local falhar, o próximo ciclo cria outro (fica registrado no log).

## SyncingStockPending — sem rota

> [`usecases/sync/syncing-stock-pending.ts`](../../../../src/serve-utils/usecases/sync/syncing-stock-pending.ts)

**Contexto.** O estoque alterado com o Transicionais fora fica na fila (`SUPPORT_CAPACITY`, D53).

**Decisão.**
- `claim_escritas('SUPPORT_CAPACITY', 5)`, uma por vez, como o online (`findSupportType` +
  `saveSupportType(withCapacity)`).
- `STOCK_BELOW_RESERVATIONS_ERROR` ou assistência que sumiu: `REJECTED` com a key; o `marcar_escrita`
  zera o `hash` do retrato e o próximo refresh mostra o valor de lá (D52). Fora do ar ou outra falha:
  `BACKOFF`. 400, 409 ou 422: `MANUAL_RETRY` (D50).
- Grava com `marcar_escrita` (trava do `updated_at`: mudou durante o envio, vai o valor novo). Responde
  a contagem.

## SyncingBookingPending — sem rota

> [`usecases/sync/syncing-booking-pending.ts`](../../../../src/serve-utils/usecases/sync/syncing-booking-pending.ts)

**Contexto.** As reservas que ficaram `PENDING` precisam chegar lá depois, sem duplicar.

**Decisão.**
- Com retrato local (fase 1 ou encerramento pendente), não envia nada.
- `claim_pending` pega até 10 linhas vencidas de todos os dias do Transicionais (`skip locked`, adia
  2 min, D39). As de ensaio antigo da fase 1 (`day_key` UUID) ficam de fora (D45, revê a D11).
- Envia cada uma pelo `SyncingUserBookingUsecase`, em paralelo e sem IP. Responde a contagem.

**Consequências.**
- Duas execuções nunca pegam a mesma linha. A trava do `updated_at` evita gravar `SYNCED` sobre uma
  mudança feita durante o envio.

## ReceivingTransicionaisWebhook — `POST /api/webhooks/transicionais`

> [`usecases/sync/receiving-transicionais-webhook.ts`](../../../../src/serve-utils/usecases/sync/receiving-transicionais-webhook.ts)

> **Em rascunho:** marcado com `@deprecated` até a revisão da Bea. Não está em uso.

**Contexto.** O Transicionais avisa mudanças do encontro e das respostas (R11, R12). A rota confere o
JWT antes (`verifyWebhookJwt`).

**Decisão.**
- O repo do Transicionais lê o corpo cru. Grava o `deliveryId`; repetido, não processa. Falhou ao
  processar: apaga o registro e relança, para o reenvio passar (D38).
- `event.updated`: grava com `gravar_retrato` (mesma trava). Outro encontro: ignora. Não deu para
  mapear: chama o `ReceivingCurrentEventUsecase` (D35).
- `validation.changed`: `aplicar_validacao` (trava de `changedAt` e da mudança local mais nova), sem
  as assistências de instrumento em `supportIds` (D37). Depois, as vagas por `gravar_vagas` (D36).

**Consequências.**
- Repetido ou fora de ordem não muda nada. Pessoa desconhecida ou sem linha no dia não cria linha (B6, D37).
- Nada foi testado com o Transicionais: o formato dos webhooks é o do plano.
