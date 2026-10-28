# spec-4 — Dúvidas (onda 2)

> Dúvidas que não bloquearam a onda 2 da T4. Cada uma diz o que foi feito para seguir.

## 1. Valor do `type` do instrumento

**Resolvida pelo orquestrador:** o `type` é exatamente `instrumento`. `LoanCatalogKind.Instrument = "instrumento"`,
e o catálogo pelos groups (B2, B3) usa esse valor. O acessório continua `acessorio`.

## 2. Filtro do dia no `GET manager-validations/guests`

A spec-4 D1 cita `configDayIds=`. O contrato tem `configDayId` (um dia) e `configDaysIds`; não tem
`configDayIds`.

**Feito:** a URL usa `configDayId` (o do contrato) e o response também filtra o item pelo
`configDayId` e pelo e-mail.

## 3. `hash` na lista de convidados

O contrato de `GET manager-validations/guests` não lista `hash` (a spec-4 D1 diz que volta).

**Feito:** `hash` é `.nullable().default(null)` no `GuestPresenceResponse`. Sem ele, a presença é
gravada `SYNCED` com o `integrationId` (`validationId`) e sem o `syncHash`.

## 4. `groupIds` no PUT do support-type

O `LoanCatalogUpdateRequest` mandava os `groupIds` do item do Hormônios, que são só os grupos do
encontro (e, no instrumento, só os que ficaram com aquele support-type). Como o support-type é da
organização, isso tiraria grupos dele (B6, B7: o Hormônios não mexe nos grupos).

**Feito:** o PUT manda os `groupIds` que o GET do support-type trouxe. Vale também para o
`createEvent`, que usa o mesmo `saveCatalog`.

## 5. Webhook do encontro passando pelo `UpdatingInternalEventUsecase`

O `EventWebhookUsecase` atualiza pelo `UpdatingInternalEventUsecase`. Com a C3, o webhook mandaria a
edição de volta ao Transicionais.

**Feito:** o `UpdatingInternalEventUsecase` só envia quando o evento tem `integrationId` **e** o `sync`
não é `SYNCED`. O que vem da Produção chega `PENDING` (`EventRequest`) e é enviado; o que vem do
webhook chega `SYNCED` (lido do Transicionais) e não é. O `EventWebhookUsecase` passou a montar o
usecase com o `transicionaisRepo` (o construtor mudou) e perdeu os `return await` que o `check.cjs`
acusou.

## 6. `FindingPublicEventUsecase` grava direto pelo repo

A A3 pede para gravar "como na fase-2 W5". O webhook cria pelo `CreatingInternalEventUsecase`, que
valida o corpo pelo `EventBodySchema` (local não vazio etc.). Um encontro do Transicionais fora desse
formato faria o `GET /api/ensaio` responder 400.

**Feito:** o usecase grava pelo `hormoniosRepository.createEvent`, com um uuid novo, `bookingOpen: false`,
`whatsappUrl: null` e o metadata do Transicionais (`SYNCED`). Dois `GET /api/ensaio` ao mesmo tempo com o
Supabase vazio podem criar dois eventos; não há trava.

## 7. Catálogo de instrumento com dois support-types para o mesmo grupo

**Feito:** cada grupo do encontro fica com o primeiro support-type `instrumento` do `summary.supports`
que tem o grupo no `groupIds`. Um support-type que serve a vários grupos vira um item só, com esses
grupos. Assim vale a regra "no máximo um INSTRUMENT por grupo" do `EventBodySchema`.

## 8. Erro na leitura da presença

A D2 diz que a falha da leitura não vira `PENDING` nem `MANUAL_RETRY`. **Feito:** o usecase pega o erro,
loga `"presence not read after send"` (`logger.error`, com `hormoniosAttendanceId`) e grava `SYNCED`
sem hash.

## 9. Vaga `0` na publicação (B10)

O Transicionais recusa `capacity: 0`, tanto no grupo quanto no dia (400). No Hormônios, `exclusiveCapacity`
e `totalVacancies` passam pelo `CountSchema` (`int().min(0)`) no `EventBodySchema` do
`CreatingInternalEventUsecase` e do `UpdatingInternalEventUsecase`, e o schema do Supabase (`EventResponse`)
só pede `int()`. Então `0` pode chegar ao `PublicationSettingsRequest`, e a gravação da publicação dá 400.

**Feito:** nada. O request manda o valor como está, sem converter `0`. Falta decidir: recusar `0` na entrada
(`min(1)`) ou outra regra.

**Decidido pela Bea:** deixar como está. A entrada continua aceitando `0`; se chegar, o envio vai para `MANUAL_RETRY` com o erro do Transicionais guardado (spec-4 B10).
