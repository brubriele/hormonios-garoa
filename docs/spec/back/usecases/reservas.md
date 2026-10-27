# Reservas

> Atualizado em 2026-10-26 (refactor do domain, [`create-domain.md`](../../../plans/create-domain.md)).
> A reserva é a `Attendance` do evento atual; a pessoa é o `User`. As presenças do `User` são só as
> do evento atual (D16).

## CreatingOrUpdatingAttendanceUsecase — `POST /api/reserva` e `POST /api/reserva/desfazer`

> [`usecases/booking/CreatingOrUpdatingAttendanceUsecase.ts`](../../../../src/serve-utils/usecases/booking/CreatingOrUpdatingAttendanceUsecase.ts)

**Contexto.** A pessoa diz se vai ao ensaio (com ou sem instrumento e acessórios) ou que não vai.
As duas rotas usam o mesmo usecase: `POST /api/reserva` responde 201 e o desfazer, 200 (D15).

**Decisão.**
- Entrada: `email` (normalizado em minúsculas), `name`, `pronoun`, `answer` (`vou` | `nao-vou`),
  `groupId`, `supportIds` e o `deviceId` do `hg_device`. Sem `groupId`, `supportIds` vazio; com
  `nao-vou`, `groupId` `null`.
- Acha o evento atual (D2) e a pessoa pelo e-mail (D16). Monta o `User`: novo (`sync: PENDING`) ou
  o existente com o nome e o pronome novos, voltando para `PENDING`.
- Para `vou`, antes de gravar:
  - reserva aberta (`BookingClosedError`);
  - as contas são feitas com as presenças das **outras** pessoas (`withAttendances`, F4);
  - quem ainda não estava `vou` (ou estava `REJECTED`) precisa de vaga no `totalVacancies`
    (`SoldOutError`);
  - com grupo: o grupo existe e está ativo; os `supportIds` (sem repetidos) são acessórios do
    evento que valem para o grupo (lista vazia = todos); quem já reservou outro grupo recebe
    `AlreadyReservedError`; instrumento do grupo esgotado → `SoldOutError`; acessório esgotado →
    `AccessorySoldOutError`; `capacity` do grupo zerado → `SoldOutError`.
- Grava a pessoa (`createOrUpdateUser`) só depois das validações, e então a presença
  (`createOrUpdateAttendance`), mantendo `id`, `createdAt`, `integrationId`, `syncHash` e
  `syncedAt` da presença anterior, com `sync: PENDING` (F8).
- Devolve o `User` com a presença gravada; a rota grava o cookie com o `userId` (D3).

**Consequências.**
- "Não vou" é uma presença gravada com `nao-vou`; "nem vi" é não ter presença (D15). Dizer que não
  vai vale com a reserva fechada.
- Reserva recusada não deixa a pessoa criada nem com o nome trocado.
- O cookie só com o `userId` deixa quem usa o e-mail de outra pessoa ver e desfazer a reserva dela
  (D26a), até o login por e-mail.

## FindingUserBookingUsecase — `GET /api/minhas-reservas`

> [`usecases/booking/FindingUserBookingUsecase.ts`](../../../../src/serve-utils/usecases/booking/FindingUserBookingUsecase.ts)

**Contexto.** A pessoa vê a própria reserva do ensaio atual.

**Decisão.**
- Entrada: o `userId` do cookie (D3). Sem cookie → `NotFoundError`.
- Acha o evento atual (D2) e a pessoa pelo id, com as presenças dela nesse evento
  (`findUserById`, D16). Não achou → `NotFoundError`.

**Consequências.**
- Nome, pronome e presenças vêm sempre da base; o cookie não guarda nada além do id (D3).
