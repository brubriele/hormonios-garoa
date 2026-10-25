# Reservas

> Atualizado em 2026-10-25 (fase 2).

## Reserve — `POST /api/reserva`

> [`usecases/reserve.ts`](../../../../src/serve-utils/usecases/reserve.ts)

**Contexto.** A pessoa reserva presença ou instrumento pelo e-mail, sem login. A reserva precisa
valer mesmo com o Transicionais fora.

**Decisão.**
- Valida o corpo, recusa com as reservas fechadas (antes do upsert, RR2) e confere que cada
  acessório vale para o instrumento (E2.9).
- Upsert da pessoa por e-mail e função `reservar` (trava, vagas e acessórios, `PENDING`).
- Envia na hora pelo `SendAttendanceUsecase`. Recusou: lança o erro traduzido (a linha fica
  `REJECTED`). Senão, responde `sync`.

**Consequências.**
- Com o Transicionais fora, a resposta é 201 `PENDING`, e o cron envia depois.
- A recusa do Transicionais chega depois da gravação local: a linha existe, como `REJECTED`, e a
  pessoa pode reservar de novo.

## CancelReservation — `POST /api/reserva/desfazer`

> [`usecases/cancel-reservation.ts`](../../../../src/serve-utils/usecases/cancel-reservation.ts)

**Contexto.** O "Não vou" de uma reserva deste aparelho, que também precisa chegar ao Transicionais.

**Decisão.**
- A linha do aparelho no dia atual vira `nao-vou`, `PENDING`, com `updated_at` novo. De outro
  aparelho ou dia: 404.
- Envia `DECLINED` na hora pelo `SendAttendanceUsecase`. Recusou: lança o erro traduzido (D34).

**Consequências.**
- Funciona com as reservas fechadas (RT8), mas o Transicionais pode recusar pelo prazo: a linha fica
  `nao-vou` e `REJECTED`, e lá a pessoa continua `ATTENDING` (D34).

## ListMyReservations — `GET /api/minhas-reservas`

> [`usecases/list-my-reservations.ts`](../../../../src/serve-utils/usecases/list-my-reservations.ts)

**Contexto.** "Minhas reservas" mostra o que este aparelho reservou no ensaio atual.

**Decisão.**
- Linhas `vou` do aparelho no dia atual, **inclusive as `REJECTED`**, com `sync` e `syncError`.
- `groupName` e `accessories` vêm do retrato. Um acessório que saiu do retrato fica de fora (D30).
- Responde uma lista do model `MyReservation`, montado pelo `MyReservationMapper`
  (`usecases/mappers/my-reservation.mapper.ts`): junta a reserva e o ensaio, só formatando (U9).

**Consequências.**
- O BFF já dá o status do envio. O front ainda não o mostra (onda 4).

## SendAttendance — sem rota

> [`usecases/send-attendance.ts`](../../../../src/serve-utils/usecases/send-attendance.ts)

**Contexto.** O envio é o mesmo na reserva, no "Não vou" e no cron (D32). Criado no construtor de
`Reserve`, `CancelReservation` e `SyncPendingAttendances`.

**Decisão.**
- Só envia linha `PENDING` do dia atual, com retrato do Transicionais.
- Manda o estado atual da linha (R8): a assistência do instrumento + os acessórios, e a
  `idempotencyKey` `<id>:<updated_at>` (E2.8).
- O repo devolve o aceito ou lança; **a decisão é do usecase** (R12), pelo tipo do erro:
  aceito → `SYNCED`; `AnswerChangedError` (`InfraError`) → `RETRY`; `UpstreamUnavailableError` →
  `BACKOFF`; recusa (`AppError`) → `REJECTED` com a `key`; qualquer outro erro (inclui
  `UpstreamResponseError` do 401/403 depois de renovar) → `BACKOFF` e log de erro.
- Grava o resultado com `marcar_sync`, só se o `updated_at` não mudou. Devolve `sync` e, se
  `REJECTED`, o erro traduzido.

**Consequências.**
- **Não relança** (foge da U5): qualquer erro vira `PENDING` e um log de erro (`logger.error`). A
  falha do envio nunca derruba a reserva local.
- O formato da resposta do `validations/change` não foi conferido numa chamada real (D33).
