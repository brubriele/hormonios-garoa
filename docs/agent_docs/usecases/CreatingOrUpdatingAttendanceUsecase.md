# CreatingOrUpdatingAttendanceUsecase — `POST /api/reserva`, `POST /api/reserva/desfazer`

> Código: [`usecases/booking/CreatingOrUpdatingAttendanceUsecase.ts`](../../../src/bff/usecases/booking/CreatingOrUpdatingAttendanceUsecase.ts).
> Rotas: [`api/reserva/index.ts`](../../../api/reserva/index.ts) e [`api/reserva/desfazer.ts`](../../../api/reserva/desfazer.ts)
> (desfazer = `answer: nao-vou`, fase-1 D15). Índice: [`README.md`](README.md).

## Fluxo

```
rota ── execute({ ...body, deviceId, userId })
  ▼ track "creating or updating attendance" { hormoniosUserId }
validateInput (CreatingOrUpdatingAttendanceInputSchema)
  ▼
findCurrentEvent()                         null → NotFoundError
  ▼
FindingUserUsecase (email, userId, emailHash, event) → toUser (nova ou atualizada, sync PENDING)
  ▼
findEventAttendance(event) → findUserAttendance (a do mesmo userId)
  ▼ answer = vou?
validateGoing (aberto, vagas, grupo, acessórios, instrumento, capacity)
  ▼
CreatingOrUpdateUserUsecase(user)          grava e envia a pessoa
  ▼
toAttendance → hormoniosRepository.createOrUpdateAttendance
  ▼
sync(user, attendance, event)
  ├─ SYNCED ou MANUAL_RETRY → não envia
  ├─ sem account ou sem transicionaisDayId → pending("User or event is not integrated")
  └─ transicionaisRepo.createAttendance(user com [attendance])
        ├─ ok → transicionaisRepo.findPresence(user)          (spec-4 D1)
        │        ├─ achou → syncHash + integrationId (validationId)
        │        └─ vazio ou erro → sem hash, com log (spec-4 D2)
        │      → SYNCED (presença e fila)
        └─ erro → PENDING (fora do ar) / MANUAL_RETRY
  ▼
User com [attendance sincronizada]
```

## A. Entrada e dependências

| # | Regra |
|---|---|
| A1 | Recebe o `hormoniosRepository`, o `transicionaisRepo`, o `CreatingOrUpdateUserUsecase` e o `FindingUserUsecase` (montados no `case` dele, U12). |
| A2 | Schema: `email` (trim, minúsculo), `name`, `pronoun`, `answer`, `groupId` (nulo), `supportIds`, `deviceId` (uuid), `userId` (uuid ou nulo, fase-1 D3) e `emailHash` (nulo). Sem `groupId`, `supportIds` vazio; `groupId` só com `answer = vou`. |

## B. Passos

| # | Regra |
|---|---|
| B1 | O ensaio é o `findCurrentEvent` (fase-1 D2). A pessoa é achada pelo `FindingUserUsecase`; se não existe, nasce com um uuid novo e `sync: PENDING`. Se existe, mantém o `id`, o `email` e o metadata, troca `name` e `pronoun` e volta para `PENDING` (fase-2 E7). |
| B2 | A presença atual é a do mesmo `userId` no evento (fase-1 D16). A gravada mantém o `id`, o `createdAt` e o `integrationId`; o `deviceId` e o `answer` vêm da entrada; `sync: PENDING`. |
| B3 | Grava a pessoa pelo `CreatingOrUpdateUserUsecase` (que também a envia) e depois a presença (`createOrUpdateAttendance`). |
| B4 | Envia quando o `sync` da presença não é `SYNCED` nem `MANUAL_RETRY`. A pessoa sem `account`, ou o evento sem `transicionaisDayId`, fica `pending` com `"User or event is not integrated"` (fase-2 E6). |
| B5 | Envia pelo `transicionaisRepo.createAttendance`, com a pessoa e `[attendance]`: o repo grava a resposta da pessoa no dia, com o grupo, o support-type `instrumento` do grupo e os acessórios (spec-4 D4). |
| B6 | Depois do envio aceito, lê a presença de volta (`transicionaisRepo.findPresence`) e grava o `syncHash` (o hash) e o `integrationId` (o `validationId`) que voltaram (spec-4 D1). |
| B7 | Leitura vazia ou com erro → loga `"presence not read after send"` (`error`, com `hormoniosAttendanceId`) e grava sem o hash; o erro da leitura não vira `PENDING` nem `MANUAL_RETRY` (spec-4 D2). O contrato não traz `hash` na lista de convidados, então hoje o `syncHash` costuma ficar `null` ([spec-4-duvidas](../../spec/spec-4-duvidas.md), 3). |
| B8 | Sucesso → `SYNCED` na presença (`syncedAt` = agora) e na fila. |

## C. Validações (só com `answer = vou`)

| # | Regra |
|---|---|
| C1 | `bookingOpen` falso → `BookingClosedError`. |
| C2 | Quem ainda não ia, e o `goingCount` dos outros já é o `totalVacancies` → `SoldOutError("Event is sold out")`. |
| C3 | Grupo inexistente ou inativo → `InvalidParameterError("Field groupId is invalid")`. |
| C4 | Acessório que não é `Accessory` ou não vale para o grupo → `InvalidParameterError("Field supportIds is invalid")`. |
| C5 | Já reservado em outro grupo → `AlreadyReservedError`. |
| C6 | Instrumento do grupo com `free = 0` → `SoldOutError`; acessório com `free = 0` → `AccessorySoldOutError`; grupo com capacity 0 → `SoldOutError`. A conta é sobre as presenças dos outros (`withAttendances(others, true)`). |

## D. Falhas, logs e saída

| # | Regra |
|---|---|
| D1 | Envio: `UpstreamUnavailableError` → `pending` com backoff; outro erro → `manualRetry` com log `"attendance rejected by Transicionais"` (fase-2 E3, E4). O `syncError` é a `key` ou a `message`. |
| D2 | O envio não derruba a rota (fase-2 E1). |
| D3 | `LogContext.Attendance`: `track` e `appError` com `hormoniosUserId`. |
| D4 | Devolve o `User` gravado com `[attendance]` já com o resultado do envio. |

