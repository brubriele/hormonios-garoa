# Reservas

> Atualizado em 2026-10-25 (fase 2).

## CreatingUserBooking — `POST /api/reserva`

> [`usecases/booking/creating-user-booking.ts`](../../../../src/serve-utils/usecases/booking/creating-user-booking.ts)

**Contexto.** A pessoa reserva presença ou instrumento pelo e-mail, sem login. A reserva precisa
valer mesmo com o Transicionais fora.

**Decisão.**
- Valida o corpo, recusa com as reservas fechadas (antes do upsert, RR2) e confere que cada
  acessório vale para o instrumento (E2.9).
- Upsert da pessoa por e-mail e função `reservar` (trava, vagas e acessórios, `PENDING`).
- Envia na hora pelo `SyncingUserBookingUsecase` e responde `sync` (`SYNCED` ou `PENDING`). A recusa do
  Transicionais não chega à rota (D44).

**Consequências.**
- Com o Transicionais fora, a resposta é 201 `PENDING`, e o cron envia depois.
- A recusa do Transicionais deixa a linha `PENDING` (D44): a reserva local vale, e o cron reenvia.

## CancelingUserBooking — `POST /api/reserva/desfazer`

> [`usecases/booking/canceling-user-booking.ts`](../../../../src/serve-utils/usecases/booking/canceling-user-booking.ts)

**Contexto.** O "Não vou" de uma reserva deste aparelho, que também precisa chegar ao Transicionais.

**Decisão.**
- A linha do aparelho no dia atual vira `nao-vou`, `PENDING`, com `updated_at` novo. De outro
  aparelho ou dia: 404.
- Envia `DECLINED` na hora pelo `SyncingUserBookingUsecase`. Qualquer falha deixa a linha `PENDING` (D44).

**Consequências.**
- Funciona com as reservas fechadas (RT8). Se o Transicionais recusar pelo prazo, a linha fica
  `nao-vou` e `PENDING`, e o cron reenvia (D44).

## FindingUserBookings — `GET /api/minhas-reservas`

> [`usecases/booking/finding-user-bookings.ts`](../../../../src/serve-utils/usecases/booking/finding-user-bookings.ts)

**Contexto.** "Minhas reservas" mostra o que este aparelho reservou no ensaio atual.

**Decisão.**
- Linhas `vou` do aparelho no dia atual, **inclusive as `REJECTED`**, com `sync` e `syncError`.
- `groupName` e `accessories` vêm do retrato. Um acessório que saiu do retrato fica de fora (D30).
- Responde uma lista do model `UserBooking`, montado pelo `UserBookingMapper`
  (`usecases/booking/mappers/user-booking.mapper.ts`): junta a reserva e o ensaio, só formatando (U9).

**Consequências.**
- O BFF já dá o status do envio. O front ainda não o mostra (onda 4).

## SyncingUserBooking — sem rota

> [`usecases/sync/syncing-user-booking.ts`](../../../../src/serve-utils/usecases/sync/syncing-user-booking.ts)

**Contexto.** O envio é o mesmo na reserva, no "Não vou" e no cron (D32). Criado no construtor de
`CreatingUserBooking`, `CancelingUserBooking` e `SyncingBookingPending`.

**Decisão.**
- Só envia linha `PENDING` de dia do Transicionais (`day_key` numérico, de qualquer encontro, D45),
  com retrato do Transicionais. O instrumento e os acessórios oferecidos vêm do encontro atual.
- Antes, `findPresence` (D49): se a presença de lá já é a da linha (resposta, grupo e assistências),
  `SYNCED` sem reenviar. Senão, dois passos (D41): `registerGuest` (a conta da pessoa na organização, idempotente pelo e-mail) e
  `sendBooking` em nome dela, com o estado atual da linha (R8): a assistência do instrumento + os
  acessórios. Qualquer falha no cadastro segue a mesma tabela, e a resposta não é enviada.
- Só vão os acessórios que o encontro oferece para o grupo. O id que não existe no encontro (linha
  migrada da fase 1, `talabarte`/`baqueta`) fica fora do envio, com `warn` (D42).
- O repo devolve o aceito ou lança; **a decisão é do usecase** (R12), pelo tipo do erro:
  aceito → `SYNCED` com o `guest_id` da conta (`order_id` e `changed_at` ficam como estavam); `AnswerChangedError` (`InfraError`) → `RETRY`; `UpstreamUnavailableError` →
  `BACKOFF`; recusa (`AppError`) → `BACKOFF` e log de erro com a `key` (D44); qualquer outro erro
  (inclui `UpstreamResponseError` do 401/403 depois de renovar) → `BACKOFF` e log de erro.
- Grava o resultado com `marcar_sync`, só se o `updated_at` não mudou. Devolve só o `sync`.

**Consequências.**
- **Não relança** (foge da U5): qualquer erro vira `PENDING` e um log de erro (`logger.error`). A
  falha do envio nunca derruba a reserva local.
- O envio pelas rotas de manager não foi conferido numa chamada real (D41).
