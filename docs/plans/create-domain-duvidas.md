# Dúvidas do refactor do domain

> Dúvidas não bloqueantes dos passos de [`create-domain.md`](create-domain.md) (D18): o que estava
> em dúvida e o que foi feito.

## Passo 1: response de `createOrUpdateAttendance` com `Attendance.event` em string

O `AttendanceResponse.toDomain(raw, event)` precisa do `Event` para resolver o grupo e o catálogo,
mas a `Attendance` que chega no `createOrUpdateAttendance(attendance)` pode ter `event` só como id
(`string`). O repo antigo fazia `attendance.event as Event`.

Feito: mantive a assinatura pedida (`createOrUpdateAttendance(attendance)`) e criei
`AttendanceResponse.toDomainOfSaved(raw, attendance)`, que resolve o grupo e o catálogo pelos da
própria `attendance` gravada e mantém o `event` dela (`Event | string`). O `toDomain(raw, event)`
ficou como estava. Alternativa, se preferir: `createOrUpdateAttendance(attendance, event)`, como o
`findAttendance(id, event)`.

## Passo 1: `event` das presenças dentro do `User`

As presenças de `findUser`/`findUserById` vêm com o `Event` inteiro (o mesmo objeto recebido), e
não com o id em `string`. O `toJson()` da `Attendance` já devolve só o `eventId`, então o evento
não se repete na saída.

## Passo 1: comentários do `AttendanceSync`

O `AttendanceSync` saiu do `Attendance.ts` para o `SyncStatus.ts` (D6). Os comentários dos valores
(`REJECTED`: "não ocupa vaga"; `MANUAL_RETRY`: "fora do cron até o ajuste manual") eram da presença
e não foram levados para o enum comum (regra: sem comentário explicativo no código novo).

## Passo 1: migration

A `v1__create_event.sql` não mudou: as colunas `"syncHash"` e `"syncedAt"` de `event` e de
`attendance` continuam, agora vindas de `metadata.syncHash` e `metadata.syncedAt`. O `user` não
ganhou coluna de sync nem de `integrationId` (D1, D7): fica tudo no jsonb.

## Passo 1: `check.cjs` e os docs

O `check.cjs` não acusou nada nos arquivos do domain e do repo. Os docs (`models.md`, G5 kebab-case,
`repos/supabase/repo.ts` na R9) ainda falam do padrão antigo; não foram tocados (fora do escopo).

## Passo 2: `validateSchema` não existe mais (check.cjs `usecase-input-schema`)

O `validateSchema` ficava em `models/model-schema.ts`, apagado com os models. O `check.cjs` acusa os
5 usecases com entrada (`usecase-input-schema`) porque procura o texto `validateSchema(`.

Feito: o `validateInput` de cada usecase chama o `parseInput(schema, input)` de
`repos/parse-response.ts` (fora do formato → `InvalidParameterError` "Field x is invalid") e devolve
a entrada já validada e normalizada (ex.: email em minúsculas). Os schemas comuns (`NonBlankSchema`,
`CountSchema`) foram declarados no próprio usecase. Não pus `check-ignore` (seria comentário, D24).
Falta decidir: um `validateSchema`/schemas comuns novos (ex.: em `domain/` ou `lib/`) e ajustar a
regra do `check.cjs`.

## Passo 2: cookie `hg_user` e o `hg_device`

- Novo `http/user-cookie.ts` (`readUserId`, `createUserCookie`): `hg_user`, http-only, 1 ano, pelo
  `buildCookie` (D3). Nome em kebab-case como os outros de `http/` (não tem classe).
- `POST /api/reserva` grava o `hg_user` com o `user.id`. `GET /api/minhas-reservas` e
  `POST /api/reserva/desfazer` leem dele.
- Sem cookie (ou id de pessoa que não existe) → `NotFoundError` (404 `NOT_FOUND_ERROR`) nos dois:
  "não conheço essa pessoa", como o "nem vi". Um id que não é uuid → 400 `INVALID_PARAMETER_ERROR`.
- O `http/device.ts` continua em uso: `POST /api/reserva` e `POST /api/reserva/desfazer` chamam o
  `getOrCreateDevice`, e o `AttendanceMetadata.deviceId` é o `hg_device` do aparelho que gravou a
  presença por último (registro de quem gravou; não é mais quem pode desfazer).
- Atenção: com o cookie só com o `userId`, quem reserva com o email de outra pessoa recebe o
  `userId` dela no cookie e pode ver/desfazer a presença dela. Antes, o desfazer era pelo `hg_device`.

## Passo 2: JSON de `User` e `ManagerEvent`

O `User.toJson()` não traz as `attendances` (é o jsonb gravado; a ligação fica na `Attendance`), e o
`ManagerEvent` não tinha `toJson()`.

Feito: as rotas de reserva respondem `{ ...user.toJson(), attendances: [attendance.toJson()] }`
(montado na rota). O `ManagerEvent` ganhou `toJson()`: `{ event, users: [{ ...user, attendances }] }`.
Alternativa: um `toJson` de saída no `User` separado do que vai para o banco.

## Passo 2: `findEventUsers(event)` no repo

O `ManagerEvent.users` precisa das pessoas das presenças. Novo método em
`IHormoniosRepository`/`HormoniosRepository`: `findEventUsers(event): Promise<User[]>`. Lê as
presenças do evento (`findEventAttendance`), busca as pessoas de uma vez (`.in("id", ids)`) e põe em
cada uma as presenças dela. Duas consultas, sem N+1. Pessoa sem presença no evento não aparece.

## Passo 2: estoque contado pelas presenças

O `stock.used` do evento não é gravado (corrida de leitura-escrita no jsonb). O
`CreatingUserBookingUsecase` conta pelas presenças do evento (`findEventAttendance`): as `vou` que
não estão `REJECTED`, sem a da própria pessoa.

- Item do catálogo com `total` null ou `rotative` não bloqueia; ocupado ≥ `total` → `SoldOutError`.
  Como o `EventCatalogMetadata.type` é `''`, não dá para separar instrumento de acessório: o
  `AccessorySoldOutError` não é usado.
- Também conferidos: `group.metadata.exclusiveCapacity` (pessoas `vou` no grupo) e
  `description.totalVacancies` (pessoas `vou` no evento), os dois → `SoldOutError`.
- Grupo inexistente ou inativo, item inexistente, item que não vale para o grupo (`groupIds` não
  vazio sem o grupo), ou `supportIds` sem `groupId` → `InvalidParameterError`. Id repetido conta uma
  vez.
- Presença `vou` que não está `REJECTED` → `AlreadyReservedError`. Presença `nao-vou` ou `REJECTED`
  é atualizada para `vou` (mesmo id e `createdAt`; `syncHash`, `syncedAt` e `integrationId` ficam).
- A pessoa existente tem nome e pronome atualizados pelo corpo e volta para `sync: PENDING`.
- O `stock.used` fica como está: 0 na criação, o valor gravado na edição.

## Passo 2: desfazer só grava `nao-vou`

O `CreatingOrUpdatingAttendanceUsecase` aceita só `answer: "nao-vou"` (`z.literal`): `vou` passa pelo
`CreatingUserBookingUsecase`, que confere estoque e reserva aberta. Sem presença no evento, cria uma
`nao-vou` sem grupo nem catálogo (a pessoa passa de "nem vi" a "não vou"); com presença, troca a
`answer`, mantém grupo e catálogo e volta para `sync: PENDING` (D15). Não confere `bookingOpen`:
dizer que não vai vale com a reserva fechada. O corpo do `POST /api/reserva/desfazer` passa a ser
`{ answer: "nao-vou" }` (antes `{ id }`), e responde 200 com o `User` (antes 204).

## Passo 2: criar e editar o evento

- O corpo segue o `Event.toJson()`; o zod descarta o que é do sistema (`id` na criação,
  `stock.used`, `catalog.metadata.type` e o metadata de integração/sync). O schema
  (`EventBodySchema`) fica exportado do `CreatingInternalEventUsecase` e o
  `UpdatingInternalEventUsecase` o reusa com o `id` (mesmo contexto).
- Os ids de grupo e de item do catálogo vêm do corpo (obrigatórios): na fase 1 não há Transicionais
  para gerá-los. O `catalog.metadata.groupIds` precisa apontar para grupos do corpo.
- Criação: `id` por `crypto.randomUUID()`, metadata de integração null, `sync: PENDING`. O evento
  criado vira o atual (D2: o mais recente). Responde 201.
- Edição: acha pelo `id` (`findEvent`, não exige que seja o atual) → `NotFoundError`. Mantém
  `externalPublicId`, `integrationId`, `transicionaisDayId`, `version`, `fetchedAt`, `syncHash` e
  `syncedAt`; `sync: PENDING`, `syncError: null`.
- Edição recusa tirar um grupo ou item usado por alguma presença do evento (`InvalidParameterError`):
  o `AttendanceResponse.toDomain` daria `InvalidResponseError` (500) em toda leitura depois. E recusa
  `total` abaixo das presenças `vou` do item (`StockBelowReservationsError`), menos rotativo.

## Passo 2: `resumo` e status das rotas

`api/admin/resumo.ts` apagado (D14). `vercel.json` não cita a rota. `POST /api/reserva` e
`POST /api/admin/novo-ensaio` respondem 201; as outras, 200.
