# Reservas

> Atualizado em 2026-10-30. A reserva é a presença da pessoa no ensaio atual, com ou sem
> instrumento.

## Descobrir quem está reservando (FindingUserUsecase) — sem rota

**Telas.** Nenhuma diretamente: roda dentro de "Identificar quem está reservando"
([`autenticacao.md`](autenticacao.md)).

**Contexto.** Acha a pessoa que já existe, se existir.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant CR as IdentifyingUserUsecase
    participant UC as FindingUserUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase

    CR->>UC: execute(IdentifyingUserCommand { user, userId, emailHash })
    UC->>UC: validateInput
    break comando inválido
        UC-->>CR: 400 Invalid Parameter
    end
    opt aparelho reconhecido (userId)
        UC->>HR: findUser({ id: userId })
        HR->>DB: select user where id
        DB-->>HR: row | null
        HR-->>UC: User | null
        break mesmo e-mail, ou o mascarado com o emailHash certo
            UC-->>CR: User (sem presenças)
        end
    end
    UC->>UC: validateEmail
    break e-mail inválido
        UC-->>CR: 400 Invalid Parameter (email)
    end
    UC->>HR: findUser({ email })
    HR->>DB: select user where email
    DB-->>HR: row | null
    HR-->>UC: User | null
    UC-->>CR: User | null
```

**Decisão.**
- Se o aparelho é reconhecido e o e-mail é o da pessoa (o completo, ou o mascarado que a tela
  mostrou), é ela.
- Senão, procura pelo e-mail, que precisa ser válido.

**Consequências.**
- Lê só a pessoa: as presenças vêm do ensaio.

## Gravar a pessoa (CreatingOrUpdateUserUsecase) — sem rota

**Telas.** Nenhuma diretamente: roda dentro de "Identificar quem está reservando" e quando uma
pessoa chega do Transicionais.

**Contexto.** A pessoa precisa estar cadastrada aqui e no Transicionais.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant CR as quem chama
    participant UC as CreatingOrUpdateUserUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    CR->>UC: execute(user)
    UC->>UC: validateInput
    UC->>UC: withoutAttendances (id novo se vier vazio)
    UC->>HR: createOrUpdateUser(user)
    HR->>DB: upsert user
    DB-->>HR: row
    HR-->>UC: User
    opt nem enviada nem parada
        UC->>HR: findIntegrationStatus(user, id)
        HR->>DB: select integration_status where entity, entityId
        DB-->>HR: row | null
        HR-->>UC: IntegrationStatus | null
        UC->>TR: createUser(user) (pelo e-mail, não duplica)
        TR-->>UC: User de lá, ou falha
        UC->>UC: synced, pending (fora do ar, na 10ª manualRetry) ou manualRetry (recusa)
        UC->>HR: createOrUpdateIntegrationStatus(status)
        HR->>DB: upsert integration_status
        UC->>HR: createOrUpdateUser(user com o sync)
        HR->>DB: upsert user
        DB-->>HR: row
        HR-->>UC: User
    end
    UC-->>CR: User
```

**Decisão.**
- Grava a pessoa e a cadastra no Transicionais. Não confere se mudou: quem chama decide.

**Consequências.**
- Uma pessoa que chega do Transicionais é gravada sempre.

## Ver as minhas reservas (FindingUserBookingUsecase) — `GET /api/membros`

**Telas.** Minhas reservas; a Presença e a folha de reserva, que já vêm preenchidas.

**Contexto.** A pessoa vê a própria reserva do ensaio atual. É também a leitura que a reserva de
instrumento usa.

**Desenho.**

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant APP as api/membros.ts
    participant UC as FindingUserBookingUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase

    C->>APP: GET /api/membros
    APP->>APP: readUserId (cookie)
    break aparelho não reconhecido
        APP-->>C: 404 User Not Found
    end
    APP->>UC: execute({ userId })
    UC->>UC: validateInput (userId uuid)
    break userId inválido
        UC-->>APP: 400 Invalid Parameter
        APP-->>C: VIEW ERROR
    end
    UC->>HR: findCurrentEvent(FindingInternalFilter atual)
    HR->>DB: select current_event where isCurrent, com event, attendance e user
    DB-->>HR: row | null
    HR-->>UC: ManagerEvent | null
    break sem ensaio atual
        UC-->>APP: 404 Event Not Found
        APP-->>C: VIEW ERROR
    end
    UC->>HR: findUser({ id: userId, event })
    HR->>DB: select user com attendance where id, eventId
    DB-->>HR: row | null
    HR-->>UC: User | null
    break pessoa não existe
        UC-->>APP: 404 User Not Found
        APP-->>C: VIEW ERROR
    end
    UC-->>APP: UserBooking (o ensaio e a pessoa)
    APP-->>C: 200 OK (UserBookingResponse)
```

**Decisão.**
- Só o aparelho reconhecido vê as próprias reservas.
- Não compara o e-mail: o aparelho basta.

**Consequências.**
- O e-mail inteiro nunca aparece na tela.

## Confirmar presença ou desfazer (CreatingOrUpdatingAttendanceUsecase) — `POST /api/membros/reservas` e `PATCH /api/membros/reservas`

**Telas.** Presença ("Confirmar presença"), Minhas reservas ("Desfazer") e o começo da folha de
reserva, quando a pessoa ainda não é reconhecida.

**Contexto.** A pessoa diz que vai ao ensaio, só com a presença, ou que não vai.

**Desenho.** A pessoa vem de "Identificar quem está reservando" ([`autenticacao.md`](autenticacao.md)),
e o ensaio, de "Ver o ensaio com quem vai" ([`producao.md`](producao.md)).

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant APP as api/membros/reservas.ts
    participant UC as CreatingOrUpdatingAttendanceUsecase
    participant FI as FindingInternalEventUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    C->>APP: POST ou PATCH /api/membros/reservas (sem groupId)
    APP->>APP: getOrCreateDevice e readUserId (cookies)
    APP->>UC: execute({ ...body, deviceId, userId })
    UC->>UC: validateInput
    break corpo inválido
        UC-->>APP: 400 Invalid Parameter
        APP-->>C: VIEW ERROR
    end
    UC->>FI: execute(FindingInternalFilter atual)
    FI-->>UC: ManagerEvent (o ensaio com as presenças e as pessoas)
    UC->>UC: validateIdentifier (IdentifyingUserUsecase)
    UC->>UC: findUserAttendance (a presença da pessoa no ensaio)
    opt vai
        UC->>UC: validateBookingOpen
        break reservas fechadas
            UC-->>APP: 409 Booking is closed
            APP-->>C: VIEW ERROR
        end
        UC->>UC: validateTotalVacancies (sem a própria pessoa)
        break sem vaga
            UC-->>APP: 409 Event is sold out
            APP-->>C: VIEW ERROR
        end
    end
    UC->>UC: toAttendance
    opt nova ou mudou (resposta, aparelho, grupo ou acessórios)
        UC->>HR: createOrUpdateAttendance(attendance, event)
        HR->>DB: upsert attendance
        DB-->>HR: row
        HR-->>UC: Attendance
    end
    opt nem enviada nem parada
        UC->>HR: findIntegrationStatus(attendance, id)
        HR->>DB: select integration_status where entity, entityId
        DB-->>HR: row | null
        HR-->>UC: IntegrationStatus | null
        alt a pessoa ou o ensaio ainda não estão lá
            UC->>UC: pending
        else pronto
            UC->>TR: createAttendance(user com a presença)
            TR-->>UC: ok, ou falha
            opt enviada
                UC->>TR: findPresence(user)
                TR-->>UC: Attendance | null (código de lá)
            end
            UC->>UC: synced, pending (fora do ar, na 10ª manualRetry) ou manualRetry (recusa)
        end
        UC->>HR: createOrUpdateIntegrationStatus(status)
        HR->>DB: upsert integration_status
        UC->>HR: createOrUpdateAttendance(attendance com o sync, event)
        HR->>DB: upsert attendance
        DB-->>HR: row
        HR-->>UC: Attendance
    end
    UC-->>APP: User (com a presença)
    APP-->>C: 201 Created (POST) ou 200 OK (PATCH), UserResponse e cookies
```

**Decisão.**
- Identifica a pessoa pelo aparelho, pelo e-mail ou pelo e-mail mascarado, e reconhece o aparelho.
- Cada pessoa tem uma presença por ensaio. Uma nova resposta substitui a anterior, e só é gravada
  quando mudou.
- Para ir, as reservas precisam estar abertas e precisa haver vaga no ensaio.
- Desfazer o instrumento mantém a presença. Desfazer a presença vira "não vou".
- "Não vou" vale mesmo com as reservas fechadas.
- A presença é enviada ao Transicionais.

**Consequências.**
- "Não vou" é uma resposta; "nem vi" é não ter resposta.
- Quem usa o e-mail de outra pessoa passa a ser ela, até existir login por e-mail.

## Reservar instrumento (CreatingOrUpdatingAttendanceUsecase) — `POST /api/membros/reservas`

**Telas.** A folha de reserva ("Reservar instrumento").

**Contexto.** A pessoa reconhecida escolhe um instrumento e os acessórios dele.

**Desenho.** O ensaio e a pessoa vêm de "Ver as minhas reservas", acima. Quem chega sem ser
reconhecido passa antes por "Confirmar presença ou desfazer", acima.

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant APP as api/membros/reservas.ts
    participant UC as CreatingOrUpdatingAttendanceUsecase
    participant FB as FindingUserBookingUsecase
    participant HR as HormoniosRepository
    participant DB as Supabase
    participant TR as TransicionaisRepo

    C->>APP: POST /api/membros/reservas (com groupId)
    APP->>APP: getOrCreateDevice e readUserId (cookies)
    APP->>UC: execute({ ...body, deviceId, userId })
    UC->>UC: validateInput
    break corpo inválido
        UC-->>APP: 400 Invalid Parameter
        APP-->>C: VIEW ERROR
    end
    UC->>UC: validateUserId
    break aparelho não reconhecido
        UC-->>APP: 404 User Not Found
        APP-->>C: VIEW ERROR
    end
    UC->>FB: execute({ userId })
    FB-->>UC: UserBooking (o ensaio e a pessoa)
    break sem ensaio atual ou pessoa não existe
        UC-->>APP: 404 Event Not Found ou User Not Found
        APP-->>C: VIEW ERROR
    end
    UC->>UC: findUserAttendance (a presença da pessoa no ensaio)
    UC->>UC: validateBookingOpen
    break reservas fechadas
        UC-->>APP: 409 Booking is closed
        APP-->>C: VIEW ERROR
    end
    UC->>UC: validateTotalVacancies (só quem ainda não ia)
    break sem vaga no ensaio
        UC-->>APP: 409 Event is sold out
        APP-->>C: VIEW ERROR
    end
    UC->>UC: findGroup e validateSupportIds
    break grupo inativo, ou acessório fora do grupo
        UC-->>APP: 400 Field groupId is invalid ou Field supportIds is invalid
        APP-->>C: VIEW ERROR
    end
    UC->>UC: validateNotReserved
    break já tem outro instrumento no ensaio
        UC-->>APP: 409 User already reserved
        APP-->>C: VIEW ERROR
    end
    UC->>UC: validateInstrumentStock, validateAccessoryStock e validateGroupCapacity (sem a própria pessoa)
    break instrumento, acessório ou grupo sem vaga
        UC-->>APP: 409 Catalog is sold out ou Group is sold out
        APP-->>C: VIEW ERROR
    end
    UC->>UC: toAttendance
    opt nova ou mudou (resposta, aparelho, grupo ou acessórios)
        UC->>HR: createOrUpdateAttendance(attendance, event)
        HR->>DB: upsert attendance
        DB-->>HR: row
        HR-->>UC: Attendance
    end
    opt nem enviada nem parada
        UC->>HR: findIntegrationStatus(attendance, id)
        HR->>DB: select integration_status where entity, entityId
        DB-->>HR: row | null
        HR-->>UC: IntegrationStatus | null
        alt a pessoa ou o ensaio ainda não estão lá
            UC->>UC: pending
        else pronto
            UC->>TR: createAttendance(user com a presença)
            TR-->>UC: ok, ou falha
            opt enviada
                UC->>TR: findPresence(user)
                TR-->>UC: Attendance | null (código de lá)
            end
            UC->>UC: synced, pending (fora do ar, na 10ª manualRetry) ou manualRetry (recusa)
        end
        UC->>HR: createOrUpdateIntegrationStatus(status)
        HR->>DB: upsert integration_status
        UC->>HR: createOrUpdateAttendance(attendance com o sync, event)
        HR->>DB: upsert attendance
        DB-->>HR: row
        HR-->>UC: Attendance
    end
    UC-->>APP: User (com a presença)
    APP-->>C: 201 Created, UserResponse e cookies
```

**Decisão.**
- Exige o aparelho reconhecido e não confere o e-mail de novo.
- Quem vai direto ao instrumento, sem ter confirmado presença, passa primeiro pela presença.
- O grupo precisa estar ativo, os acessórios precisam valer para o grupo, a pessoa não pode ter
  outro instrumento no ensaio, e precisa haver vaga no instrumento, nos acessórios e no grupo.
- As vagas são contadas sem a própria pessoa, então ela pode trocar os acessórios.

**Consequências.**
- A pessoa é lida uma vez em cada chamada.
- Num aparelho reconhecido, o instrumento vai para a pessoa desse aparelho, mesmo que outra pessoa
  digite outro e-mail na folha.
