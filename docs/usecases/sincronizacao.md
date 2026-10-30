# Sincronização

> Atualizado em 2026-10-29. O ensaio, as pessoas e as presenças ficam iguais no Transicionais: o
> que muda aqui é enviado para lá, e o que muda lá é trazido para cá.

## Envio — dentro de criar ensaio, gravar pessoa e reservar

**Telas.** As mesmas desses usecases. O envio não aparece na tela.

**Contexto.** Criar um ensaio, editar o estoque, gravar uma pessoa ou uma reserva precisa chegar ao Transicionais,
sem fazer a tela esperar nem falhar.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant CR as usecase que grava
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    CR->>CR: shouldSync
    break já enviado ou parado
        CR->>CR: segue sem enviar
    end
    CR->>HR: findIntegrationStatus(entidade, id)
    HR->>DB: select integration_status where entity, entityId
    DB-->>HR: row | null
    HR-->>CR: IntegrationStatus | null (sem fila, cria uma)
    alt ensaio sem data, ou reserva sem a pessoa ou o ensaio lá
        CR->>CR: pending
    else pronto
        CR->>TR: createEvent | updateEvent | createUser | createAttendance
        TR-->>CR: o que ficou lá, ou falha
        opt reserva enviada
            CR->>TR: findPresence(user)
            TR-->>CR: Attendance | null (código de lá)
        end
        CR->>CR: synced, pending (fora do ar ou desligado, na 10ª manualRetry) ou manualRetry (recusa)
    end
    CR->>HR: createOrUpdateIntegrationStatus(status)
    HR->>DB: upsert integration_status
    CR->>HR: updateEvent | createOrUpdateUser | createOrUpdateAttendance
    HR->>DB: update event | upsert user | upsert attendance
```

**Decisão.**
- Logo depois de gravar, o sistema envia.
- Se o Transicionais estiver fora do ar, tenta de novo depois de 1, 5, 15 e então a cada 60
  minutos. Na 10ª tentativa, para e espera alguém.
- Se o Transicionais recusar, para e espera alguém, com o motivo guardado.
- Com o Transicionais desligado de propósito na configuração, o envio fica pendente na hora, sem
  esperar por ele. Ao religar, o reenvio automático manda o que ficou pendente.
- Enquanto o ensaio não tem data, ou a pessoa ou o ensaio ainda não chegaram lá, a reserva espera
  para ser enviada.
- A reserva com grupo leva o instrumento do grupo e os acessórios escolhidos.
- Depois de enviada, a reserva guarda o código que ela ganhou no Transicionais.

**Consequências.**
- A tela responde igual com ou sem o Transicionais.
- O que parou precisa de alguém para olhar o motivo e mandar de novo.

## Receber um aviso do Transicionais (WebhookUsecase) — `POST /api/webhooks/transicionais`

**Telas.** Nenhuma: quem chama é o Transicionais. O resultado aparece nas telas que mostram o
ensaio e as reservas.

**Contexto.** O Transicionais avisa que um encontro, uma pessoa ou uma presença mudou.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant C as Transicionais
    participant APP as api/webhooks/transicionais.ts
    participant UC as WebhookUsecase
    participant EW as EventWebhookUsecase
    participant UW as UserWebhookUsecase
    participant AW as AttendanceWebhookUsecase

    C->>APP: POST /api/webhooks/transicionais
    APP->>APP: requireWebhookKey
    break sem a chave
        APP-->>C: 401 Webhook api key required
    end
    APP->>UC: execute(body)
    UC->>UC: validateInput (entity, sendAt e o id da entidade)
    break corpo inválido
        UC-->>APP: 400 Invalid Parameter
        APP-->>C: 400
    end
    alt entity event
        UC->>EW: execute(Webhook(eventId))
        EW-->>UC: WebhookResult
    else entity user
        UC->>UW: execute(Webhook(userId))
        UW-->>UC: WebhookResult
    else entity validation
        UC->>AW: execute(Webhook(validationId))
        AW-->>UC: WebhookResult
    else outra
        UC->>UC: WebhookResult(rejected)
    end
    UC-->>APP: WebhookResult
    APP-->>C: 200 OK (synced, pending ou rejected)
```

**Decisão.**
- Só aceita aviso com a chave combinada.
- Encaminha o aviso conforme o que mudou: encontro, pessoa ou presença. Outro tipo é recusado.
- Responde se aceitou e como ficou: igual, pendente (o Transicionais estava fora do ar) ou
  recusado.

**Consequências.**
- O mesmo aviso repetido não causa problema, porque só grava o que mudou.

## Trazer um encontro alterado (EventWebhookUsecase) — sem rota

**Telas.** Nenhuma: o ensaio aparece na Home e na Produção.

**Contexto.** Um encontro foi criado ou alterado no Transicionais.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant CR as WebhookUsecase
    participant UC as EventWebhookUsecase
    participant CI as CreatingInternalEventUsecase
    participant UI as UpdatingInternalEventUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    CR->>UC: execute(Webhook)
    UC->>UC: validateInput
    UC->>TR: findEvent(id)
    break fora do ar
        TR-->>UC: 503
        UC-->>CR: WebhookResult(pending)
    end
    TR-->>UC: Event (só os grupos da publicação) | 404
    break não existe lá
        UC-->>CR: WebhookResult(rejected)
    end
    opt tem integrationId
        UC->>HR: findEvent({ integrationId })
        HR->>DB: select event where integrationId
        DB-->>HR: row | null
        HR-->>UC: Event | null
    end
    break não existe aqui
        UC->>CI: execute(event)
        CI-->>UC: Event (reservas fechadas)
        UC-->>CR: WebhookResult(synced)
    end
    UC->>UC: isChanged (hash mudou e version não é mais antiga)
    break não mudou
        UC-->>CR: WebhookResult(synced)
    end
    UC->>UI: execute(event)
    UI-->>UC: ManagerEvent
    break tirou um grupo ou item reservado, ou estoque abaixo das reservas
        UC-->>CR: 400 Field groups must keep group ou 409 Stock is below reservations
    end
    UC-->>CR: WebhookResult(synced)
```

**Decisão.**
- Se o encontro não existe lá, recusa.
- Se o ensaio ainda não existe aqui, cria. Se existe e mudou, atualiza. Uma versão mais antiga que
  a guardada é ignorada.
- O link do grupo e a abertura das reservas não mudam por esse aviso.
- Só entram os grupos que estão na publicação do encontro lá. O instrumento de cada grupo vem do
  cadastro dele no Transicionais; o grupo sem esse cadastro fica sem instrumento.

**Consequências.**
- As regras de criar e editar o ensaio também valem aqui: um encontro que tira um grupo com reserva
  é recusado.

## Trazer uma pessoa alterada (UserWebhookUsecase) — sem rota

**Telas.** Nenhuma: a pessoa aparece em Minhas reservas e na Produção.

**Contexto.** Uma pessoa foi cadastrada ou alterada no Transicionais.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant CR as WebhookUsecase
    participant UC as UserWebhookUsecase
    participant CU as CreatingOrUpdateUserUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    CR->>UC: execute(Webhook)
    UC->>UC: validateInput
    UC->>TR: findUser(id)
    break fora do ar
        TR-->>UC: 503
        UC-->>CR: WebhookResult(pending)
    end
    TR-->>UC: User | 404
    break não existe lá
        UC-->>CR: WebhookResult(rejected)
    end
    opt tem integrationId
        UC->>HR: findUser({ integrationId })
        HR->>DB: select user where integrationId
        DB-->>HR: row | null
        HR-->>UC: User | null
    end
    opt não achou e tem e-mail
        UC->>HR: findUser({ email })
        HR->>DB: select user where email
        DB-->>HR: row | null
        HR-->>UC: User | null
    end
    break não achou e sem e-mail
        UC-->>CR: WebhookResult(rejected)
    end
    alt achou
        UC->>UC: linkUser (só integrationId e conta de lá)
        UC->>CU: execute(pessoa daqui, ligada)
    else não achou
        UC->>CU: execute(pessoa de lá)
    end
    CU-->>UC: User
    UC-->>CR: WebhookResult(synced)
```

**Decisão.**
- Se a pessoa não existe lá, recusa.
- Procura a pessoa aqui pela conta ou pelo e-mail.
- Se não existe, cria; sem e-mail, recusa.
- Se existe, só liga a pessoa à conta. Nome, e-mail e pronome não mudam.

**Consequências.**
- Quem reservou não tem o nome trocado por esse aviso.

## Trazer uma presença alterada (AttendanceWebhookUsecase) — sem rota

**Telas.** Nenhuma: a presença aparece em Minhas reservas, nas vagas da Home e de Instrumentos e
na Produção.

**Contexto.** Uma presença foi criada ou alterada no Transicionais.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant CR as WebhookUsecase
    participant UC as AttendanceWebhookUsecase
    participant CU as CreatingOrUpdateUserUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    CR->>UC: execute(Webhook)
    UC->>UC: validateInput
    UC->>TR: findAttendance(id)
    break fora do ar
        TR-->>UC: 503
        UC-->>CR: WebhookResult(pending)
    end
    TR-->>UC: User com a presença | 404
    break não existe lá
        UC-->>CR: WebhookResult(rejected)
    end
    UC->>HR: findEvent({ transicionaisDayId })
    HR->>DB: select event where transicionaisDayId
    DB-->>HR: row | null
    HR-->>UC: Event | null
    break ensaio não existe aqui
        UC-->>CR: WebhookResult(rejected)
    end
    opt tem integrationId
        UC->>HR: findUser({ integrationId })
        HR->>DB: select user where integrationId
        DB-->>HR: row | null
        HR-->>UC: User | null
    end
    opt não achou
        UC->>HR: findUser({ email })
        HR->>DB: select user where email
        DB-->>HR: row | null
        HR-->>UC: User | null
    end
    opt ainda não achou
        UC->>CU: execute(pessoa de lá)
        CU-->>UC: User
    end
    opt presença tem integrationId
        UC->>HR: findAttendance({ integrationId, event })
        HR->>DB: select attendance where eventId, integrationId
        DB-->>HR: row | null
        HR-->>UC: Attendance | null
    end
    opt não achou
        UC->>HR: findEventAttendance(event)
        HR->>DB: select attendance where eventId
        DB-->>HR: rows
        HR-->>UC: Attendance[]
        UC->>UC: a da pessoa
    end
    UC->>UC: isChanged (nova, ou hash mudou e version não é mais antiga)
    opt mudou
        UC->>UC: toAttendance (mantém id, data e aparelho, só acessórios do ensaio)
        UC->>HR: createOrUpdateAttendance(attendance, event)
        HR->>DB: upsert attendance
    end
    UC-->>CR: WebhookResult(synced)
```

**Decisão.**
- Se a presença não existe lá, ou o ensaio dela não existe aqui, recusa.
- Acha a pessoa ou a cria.
- Grava a presença quando é nova ou mudou, mantendo a data em que foi feita e o aparelho.
- Dos acessórios, ficam só os que o ensaio oferece.
- Não confere vaga nem prazo: a presença já foi aceita lá.

**Consequências.**
- A presença trazida não é enviada de volta.

## Reenviar o que ficou pendente (JobUsecase) — `GET /api/cron/sync?type=event|user|attendance` e agendador

**Telas.** Nenhuma: quem chama é o agendador da Cloudflare, a cada 5 minutos, ou alguém pela rota.

**Contexto.** O que não chegou ao Transicionais precisa ser enviado de novo, sem ninguém pedir.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant AG as cronjob/handler.ts
    participant C as Client
    participant APP as api/cron/sync.ts
    participant UC as JobUsecase
    participant EJ as EventJobUsecase
    participant UJ as UserJobUsecase
    participant AJ as AttendanceJobUsecase

    alt agendador, a cada 5 min
        AG->>UC: execute({ entity })
    else rota
        C->>APP: GET /api/cron/sync?type=event|user|attendance
        APP->>APP: requireCron
        break sem a chave
            APP-->>C: 401 Cron secret required
        end
        APP->>UC: execute({ entity: type })
    end
    UC->>UC: validateTransicionaisEnabled
    break Transicionais desligado
        UC-->>APP: 503 Transicionais is disabled
        APP-->>C: 503
    end
    UC->>UC: validateInput (event, user ou attendance)
    break outro tipo
        UC-->>APP: 400 Invalid Parameter
        APP-->>C: 400
    end
    alt event
        UC->>EJ: execute(Job)
        EJ-->>UC: Event[]
    else user
        UC->>UJ: execute(Job)
        UJ-->>UC: User[]
    else attendance
        UC->>AJ: execute(Job)
        AJ-->>UC: Attendance[]
    end
    UC-->>APP: o que foi reenviado
    APP-->>C: 200 OK (lista, com o status de cada um)
```

**Decisão.**
- O agendador roda sozinho a cada 5 minutos, um horário para cada tipo. Pela rota, só aceita a
  chamada com a chave combinada.
- Recebe o que reenviar: ensaios, pessoas ou presenças. Outro tipo é recusado.
- Com o Transicionais desligado de propósito na configuração, não reenvia nada e avisa que ele
  está fora do ar.
- Responde a lista do que foi reenviado, com o resultado de cada um.

**Consequências.**
- Cada tipo é chamado separado, então um tipo com problema não atrasa os outros.
- Enquanto o Transicionais está desligado, as tentativas não contam: o que ficou pendente não
  para por excesso de tentativas.
- Cada rodada deixa registrado o que aconteceu com cada item e um resumo, para o time conferir.

## Reenviar ensaios, pessoas ou presenças (EventJobUsecase, UserJobUsecase e AttendanceJobUsecase) — sem rota

**Telas.** Nenhuma: quem chama é o reenvio acima.

**Contexto.** Cada um reenvia os pendentes de um tipo.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant CR as JobUsecase
    participant UC as Event, User ou AttendanceJobUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    CR->>UC: execute(Job)
    UC->>UC: validateInput
    UC->>HR: findDueIntegrationStatus(tipo, pending, agora, 30)
    HR->>DB: select integration_status where entity, pending, nextSyncAt vazio ou vencido order syncAt limit 30
    DB-->>HR: rows
    HR-->>UC: IntegrationStatus[]
    loop cada um, em paralelo
        alt event
            UC->>HR: findEvent({ id })
            HR->>DB: select event where id
        else user
            UC->>HR: findUser({ id })
            HR->>DB: select user where id
        else attendance
            UC->>HR: findEvent({ attendanceId })
            HR->>DB: select event inner join attendance where id
            UC->>HR: findAttendance({ id, event })
            HR->>DB: select attendance where eventId, id
            UC->>HR: findUser({ id: userId })
            HR->>DB: select user where id
        end
        HR-->>UC: Event | User | Attendance | null
        alt não existe mais
            UC->>HR: createOrUpdateIntegrationStatus(manualRetry)
            HR->>DB: upsert integration_status
        else existe
            alt ensaio sem data e ainda não lá, ou reserva sem a pessoa ou o ensaio lá
                UC->>UC: pending
            else pronto
                UC->>TR: createEvent | updateEvent (já está lá) | createUser | createAttendance
                TR-->>UC: o que ficou lá, ou falha
                opt reserva enviada
                    UC->>TR: findPresence(user)
                    TR-->>UC: Attendance | null (código de lá)
                end
                UC->>UC: synced, pending (fora do ar, na 10ª manualRetry) ou manualRetry (recusa)
            end
            UC->>HR: createOrUpdateIntegrationStatus(status)
            HR->>DB: upsert integration_status
            UC->>HR: updateEvent | createOrUpdateUser | createOrUpdateAttendance
            HR->>DB: update event | upsert user | upsert attendance
        end
    end
    UC-->>CR: Event[] | User[] | Attendance[] (os que existiam)
```

**Decisão.**
- Pega os pendentes cuja nova tentativa já está na hora, os mais antigos primeiro, até 30 por vez.
- Envia cada um com as mesmas regras do **Envio**. Um que falha não para os outros.
- O que não existe mais aqui para e espera alguém.
- O ensaio que já está no Transicionais não é criado de novo: só a edição do estoque é reenviada.

**Consequências.**
- O que parou para alguém olhar não volta sozinho.
