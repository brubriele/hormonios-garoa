# Back — Fase 2: a integração com o Transicionais

> Cada história diz o que foi preciso criar ou alterar em cada camada. O que a fase 1 ou outra
> história já criou só é citado. O que cada usecase faz está em
> [`docs/usecases/sincronizacao.md`](../../usecases/sincronizacao.md). O detalhe para agente:
> [`spec/fase-2.md`](../../spec/fase-2.md#back--fase-2).

**Camadas novas:** o repo do Transicionais
([`repos/transicionais/`](../../../src/serve-utils/repos/transicionais/)), com a sessão (login e
token), os pedidos e as respostas, e a fila de envio
([`v2__create_integration_status.sql`](../../../supabase/migrations/v2__create_integration_status.sql)).

## Como Produção, quero que o ensaio criado apareça no Transicionais

Criados:
- **Domain** [`IntegrationStatus`](../../../src/serve-utils/domain/IntegrationStatus.ts) e
  [`SyncStatus`](../../../src/serve-utils/domain/SyncStatus.ts): a fila e o estado do envio, com as
  novas tentativas.
- **Banco** `integration_status` e **repo** buscar e gravar a fila.
- **Repo do Transicionais:** criar o encontro (dados, categoria, grupos, publicação, dia e
  catálogo) e a sessão.

Alterado: o **usecase** `CreatingInternalEventUsecase` envia depois de gravar.

O ensaio é enviado logo depois de criado. Se o Transicionais estiver fora do ar, fica na fila.

## Como pessoa, quero que a minha reserva chegue ao Transicionais

Criado: no **repo do Transicionais**, cadastrar a pessoa e enviar a presença.

Alterados: os **usecases** `CreatingOrUpdateUserUsecase` e `CreatingOrUpdatingAttendanceUsecase`
enviam depois de gravar.

Já existiam: a fila e o estado do envio.

## Como Produção, quero que um encontro alterado no Transicionais apareça aqui

Criados:
- **Domain** [`Webhook`](../../../src/serve-utils/domain/Webhook.ts): o aviso e a resposta dele.
- **Repo do Transicionais:** buscar o encontro. **Repo:** achar o ensaio pelo id do Transicionais.
- **Usecases** `WebhookUsecase` e `EventWebhookUsecase`.
- **Chave do webhook** ([`http/webhook-auth.ts`](../../../src/serve-utils/http/webhook-auth.ts)) e
  **rota** `POST /api/webhooks/transicionais`.

Já existiam: `CreatingInternalEventUsecase` e `UpdatingInternalEventUsecase`, que gravam o
encontro.

## Como Produção, quero que uma pessoa alterada no Transicionais apareça aqui

Criados: **repo do Transicionais** buscar a conta; **repo** achar a pessoa pelo id do
Transicionais; **usecase** `UserWebhookUsecase`.

Já existiam: a rota do webhook e o `CreatingOrUpdateUserUsecase`.

## Como Produção, quero que uma presença alterada no Transicionais apareça aqui

Criados: **repo do Transicionais** buscar a presença; **repo** achar o ensaio pelo dia do
Transicionais e a presença pelo id de lá; **usecase** `AttendanceWebhookUsecase`.

Já existiam: a rota do webhook e o `CreatingOrUpdateUserUsecase`.

## Como time, quero que o que falhou seja reenviado sozinho

Criados:
- **Domain** [`Job`](../../../src/serve-utils/domain/Job.ts): o tipo a reenviar.
- **Repo:** os pendentes vencidos da fila, a pessoa pelo id e o ensaio de uma presença.
- **Usecases** `JobUsecase`, `EventJobUsecase`, `UserJobUsecase` e `AttendanceJobUsecase`.
- **Chave do cron** ([`http/cron-auth.ts`](../../../src/serve-utils/http/cron-auth.ts)) e **rota**
  `GET /api/cron/sync?type=event|user|attendance`.
- **Script** `yarn cron:sync` ([`scripts/cron.mjs`](../../../scripts/cron.mjs)).

Já existiam: a fila, o envio do repo do Transicionais e a mesma regra de envio dos usecases de
criação.

## Como Produção, quero desligar o Transicionais de propósito sem travar a fila

Criados:
- **Banco** `setting` ([`v3__create_setting.sql`](../../../supabase/migrations/v3__create_setting.sql)),
  linha `integration`.
- **Domain** `IntegrationSetting`: a chave do Transicionais (ligado ou desligado).
- **Client** `FakeHttpClient` e a interface `IHttpClient`: o Transicionais desligado responde
  "fora do ar" na hora, sem rede.
- **Repo:** `isTransicionaisEnabled`, ler e gravar a chave.
- **Usecases** `FindingIntegrationSettingUsecase` e `UpdatingIntegrationSettingUsecase`.
- **Rota** `GET` e `PUT /api/admin/integracao`.

Alterados:
- **`Envolviment`:** `make` passa a ser `async` e injeta o repo do Transicionais com o
  `FakeHttpClient` quando a chave está desligada; as rotas fazem `await` no `make`.
- **`JobUsecase`:** a 1ª linha confere a chave; desligada, responde 503 sem tocar a fila.

Já existiam: o plano de falha dos usecases de envio (fora do ar → `Pending`), que não muda.

## Como time, quero achar as falhas do Transicionais nos logs

Alterado: o padrão de log ganha os contextos `Sync`, `Job` e `TransicionaisRepository`. O repo do
Transicionais loga toda falha antes de lançar.
