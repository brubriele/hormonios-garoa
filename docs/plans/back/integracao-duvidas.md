# Dúvidas da onda 2 — chave do Transicionais

Resolvidas pelos docs, sem bloquear. Revisar e apagar este arquivo ao fechar a tarefa.

| # | Dúvida | O que foi feito |
|---|---|---|
| 1 | O plano tinha `private static async transicionaisRepo(): Promise<ITransicionaisRepo>`. Mas o `make` precisa do estado **antes** de olhar o cache (a chave é `token` + estado). | `make` chama `transicionaisState(token)` (async: `on`, `off` ou `null` para usecase sem Transicionais, pelo `Set` `transicionaisTokens`) e monta a chave `${token}:on\|off`. O `case` recebe o repo por `transicionaisRepo(state)` (sync), que escolhe entre os getters lazy `onTransicionaisRepo` e `fakeTransicionaisRepo`. Enum privado `TransicionaisState` (G6). `envolviment.md`, passo 4 de "Usecase novo", atualizado. |
| 2 | Quais usecases contam como "usa o Transicionais" (EV8)? | Os 5 que recebem `ITransicionaisRepo`: `CreatingOrUpdatingAttendanceUsecase`, `FindingInternalEventUsecase`, `CreatingInternalEventUsecase`, `JobUsecase` e `WebhookUsecase`. O webhook, com a chave desligada, recebe o repo fake: se ele precisar buscar no Transicionais, responde 503 (o Transicionais reenvia o aviso). |
| 3 | `findIntegrationSetting` sem linha: qual `updatedAt`? | Ligado, com `updatedAt` = agora (`IntegrationSettingResponse.toDefault(now)`, K1). |
| 4 | `isTransicionaisEnabled` com consulta própria? | Reusa `findIntegrationSetting()` (uma consulta, mesmo default). |
| 5 | Quem define o `updatedAt` no `PUT`? | O `IntegrationSettingRequest.toDomain` da rota (hora do pedido), porque o domain exige `updatedAt` válido. O repo grava também a coluna `updated_at`. |
| 6 | `JobUsecase`: `validateTransicionaisEnabled` antes ou depois do `validateInput` (U10 diz que o `validateInput` é a 1ª linha)? | Antes, logo depois do `track`, seguindo J0 ("1ª linha"). Com a chave desligada, até um `type` inválido responde 503. |
| 7 | `check.cjs` acusava `inline-new` (G10) já existentes em `repos/transicionais/repo.ts` e `repos/supabase/HormoniosRepository.ts`, arquivos tocados. | Corrigidos sem mudar comportamento (`const now = new Date()`, `const unavailable = new …` antes do `throw this.logged(…)`). |
| 8 | `IHttpClient` precisa do `IHttpRequest`, que mora em `clients/http-client.ts`. | `interfaces/IHttpClient.ts` importa o tipo (`import type`). `HttpMethod` e `IHttpRequest` ficaram onde estavam. |
| 9 | Front: onde fica o botão (F15)? | No card "DISPONIBILIDADE PARA O PÚBLICO", logo abaixo do bloco do status, com as classes do `toggleBooking` (`primary-btn`) e `margin-top:12px` inline (sem mexer no `styles.css`). Sem debug, `integrationButtonHtml()` devolve vazio. |
