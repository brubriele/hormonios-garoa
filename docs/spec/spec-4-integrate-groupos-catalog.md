# spec-4 — Grupos e catálogo integrados ao Transicionais

> **Concluído em 2026-10-28.** Dúvidas e decisões: [`spec-4-duvidas.md`](spec-4-duvidas.md). Tarefa: [`plans/back/T4-integrate-groupos-catalog.md`](../plans/back/T4-integrate-groupos-catalog.md).
> Regras de [`fase-2.md`](fase-2.md) citadas como "fase-2 E3".

## Desenho

```
Transicionais (admin próprio)
  cria os grupos ──────────► vêm nos groups do GET público do encontro      (B1)
  cria os support-types ───► GET/PUT manager-support-types/{id}               (B1)
  (type=instrumento ligado ao grupo)
                       │
GET /api/ensaio        │            GET /api/admin/ensaio
  │ Supabase vazio?    │              │
  ├─ sim → último Público (A2) ──┐    │
  │        grava aqui (A3)       │    │
  ▼                              ▼    ▼
findEvent ── com event_id → details/{id} → external id → GET público          (A1)
  │
  └─ catálogo de instrumento = grupos do encontro                             (B2)
       cada grupo: support-type type=instrumento do encontro (summary.supports)
       capacity 0 → aparece com 0; sem support-type → o grupo não aparece (B3)

PUT /api/admin/ensaio (estoque −/+)
  │ grava no Supabase
  ▼ tem integrationId? ── não → como hoje
  │ sim
  ▼
PUT manager-support-types/{id} (inteiro, D26)                                 (C1)
  zerar = capacity 0 (null = sem limite); isActive true (C2, C5)
  falha → fila PENDING ou MANUAL_RETRY (fase-2 E1–E5)                         (C3)
  job: integrationId + PENDING → reenvia a edição                             (C4)

reserva ── POST manager-validations/change (2xx)
  ▼
findPresence: GET manager-validations/guests?configDayId=&search=<email>     (D1)
  grava syncHash e integrationId (validationId)
  vazio ou falha → SYNCED sem hash                                            (D2)
```

## A. Achar o encontro no Transicionais

| # | Regra |
|---|---|
| A1 | **Com `event_id`** (`integrationId`): `GET manager-events/details/{id}` dá o external id, e com ele se lê o GET público. É o `findEvent` de hoje. |
| A2 | **Sem `event_id`**: `GET manager-events/details?visibility=PUBLIC&orderBy=startAt:desc&perPage=1` (o antigo `listPublicEventsFrom`). O primeiro item é o Público de `startAt` mais tarde, e o `externalId` dele leva ao GET público, como em A1. Sem item → `NotFoundError`. |
| A3 | `FindingPublicEventUsecase` (`GET /api/ensaio`): sem ensaio atual no Supabase, busca o último Público (A2) e grava aqui, como na fase-2 W5 (reserva fechada, sem `whatsappUrl`). Com o Transicionais fora do ar, ou sem encontro lá, continua `NotFoundError`. |

## B. Estoque na leitura: os grupos mantêm o catálogo

| # | Regra |
|---|---|
| B1 | Os grupos e os support-types são criados no admin do próprio Transicionais. Os grupos usados são os mesmos que o GET público do encontro devolve (`groups`). Não há listagem à parte. O Hormônios não cria nenhum dos dois: só lê, e edita o support-type (C1). |
| B2 | Na leitura do encontro, o catálogo de instrumento é montado a partir dos grupos do encontro. Para cada grupo, a disponibilidade vem do support-type `type=instrumento` do encontro (`summary.supports`). Isso vale só para o `type=instrumento`. |
| B3 | Support-type com `capacity: 0` aparece com 0 (C2). Grupo sem support-type `type=instrumento` no `summary.supports` **não aparece** no catálogo: o support-type não existe, ou não cumpre B5 (não foi cadastrado ou não foi sincronizado). |
| B5 | Um support-type só vem no `summary.supports` quando tem `requiredForActivity: true`, está ativo, está marcado na publicação do encontro (`supportTypeIds`) e o dia já foi salvo. O Transicionais não cruza o tipo com os grupos: quem cruza pelo `groupIds` é o Hormônios. O `type` é texto livre e tem que ser exatamente `instrumento`. |
| B6 | Cadastrar o support-type de um grupo e marcá-lo na publicação é manual, no admin do Transicionais. O Hormônios não cria support-type nem mexe no `supportTypeIds` da publicação. |
| B7 | A edição dos grupos do encontro (quais grupos e as vagas de cada um) também é feita no admin do Transicionais. O Hormônios não envia grupos: atualiza a base pela sincronização (webhook do encontro, fase-2 W5). |
| B4 | A tela do gestor mostra só a disponibilidade do support-type `type=instrumento` que vem do encontro. |
| B8 | Só viram grupos do evento os `groups[]` do GET público com `externalGroupId` preenchido: os que estão na publicação (`public.vacancies.groups`). Grupo com `externalGroupId: null` está no encontro, mas não na publicação. O Transicionais recusa a reserva de convidado nele (`VALIDATION_GROUP_NOT_IN_EVENT`), então ele não entra no evento do Hormônios. O valor do grupo continua sendo o `groups[].id`. |
| B9 | Ao gravar a publicação (`PUT manager-events/details/{id}`), os grupos vão em `public.groups: [{ groupId, capacity }]` e o limite do dia em `public.capacity`. **Não** em `public.vacancies`: esse é só o formato do GET, e no PUT a chave é descartada sem erro, o que apaga os grupos da publicação. Vão **todos** os grupos do evento, com `capacity` = `exclusiveCapacity`; `public.capacity` = `totalVacancies`. Sem limite = `null`. A lista substitui a inteira, então sempre vão todos (e o `supportTypeIds` também). Isso cria a linha do grupo na publicação e faz o `groups[].externalGroupId` vir preenchido (B8). Conferido nos encontros 214 e 215: `vacancies.groups: []` e todo `externalGroupId: null`. |
| B10 | O Transicionais não aceita `capacity: 0` (precisa ser positivo ou `null`), nem no grupo nem no dia. Com todos os grupos sem limite e o dia sem limite, a presença sem grupo ("Não se aplica") continua aceita. Decidido: a entrada continua aceitando `0`. Se chegar, a gravação da publicação é recusada e o envio vai para `MANUAL_RETRY`, com o erro guardado. |

## Por que o grupo X não aparece no catálogo?

Há dois motivos:

- **O grupo some do evento inteiro** (não aparece para escolher na reserva): ele não está na publicação do
  encontro (B8). No admin do Transicionais, coloque o grupo na publicação, com a vaga dele.
- **O grupo aparece, mas sem instrumento no catálogo**: ele não tem um support-type `type=instrumento` que
  chegue no `summary.supports` (B3, B5).

Para ele aparecer:

1. no admin do Transicionais, ponha o grupo na publicação do encontro (B8) e cadastre o support-type com `type` exatamente `instrumento`, o grupo no
   `groupIds`, `requiredForActivity: true` e ativo, e marque-o na publicação do encontro (B6);
2. sincronize o evento no Hormônios (webhook do encontro ou `yarn cron:webhook --entity=event --id=<id>`),
   para a leitura (A1) trazer o catálogo de novo.

## C. Editar o estoque

| # | Regra |
|---|---|
| C1 | Editar o estoque é um `PUT manager-support-types/{id}`, com o corpo inteiro (D26; o antigo `saveLoanCatalog`), para deixar o Transicionais igual ao Hormônios. |
| C2 | Zerar é o mesmo PUT com `capacity: 0`. O support-type continua no `summary.supports` com `capacity: 0`, então voltar para 1 é outro PUT. `capacity: null` não é zero: é sem limite. |
| C5 | O PUT mantém `isActive: true` e o `requiredForActivity` que já estava. `isActive: false` tira o tipo do summary e trava a publicação. |
| C6 | Um item rotativo com `capacity: 0` ainda aceita reserva no Transicionais. Para "não tem mais instrumento", o item precisa de `rotativo: false`. |
| C3 | O `UpdatingInternalEventUsecase` envia depois de gravar no Supabase, quando o evento tem `integrationId`. Segue as fase-2 E1–E5: a falha não derruba a rota e vai para a fila (`PENDING` ou `MANUAL_RETRY`). |
| C4 | Job: evento com `integrationId` e fila `PENDING` → envia como em C3. Muda a fase-2 J6, que só marcava `SYNCED`. |

## D. Presença depois do envio

| # | Regra |
|---|---|
| D1 | Depois do `createAttendance` com 2xx, lê a presença da pessoa no dia pelo e-mail (`findPresence`, `GET manager-validations/guests?configDayId=&search=`). Grava o `syncHash` e o `integrationId` (`validationId`) que voltaram. |
| D2 | A leitura voltou vazia ou falhou depois de um envio aceito → fica `SYNCED` sem o hash. O envio já valeu. |
| D3 | Vale no `CreatingOrUpdatingAttendanceUsecase` e no `AttendanceJobUsecase`. |
| D4 | No Hormônios, o instrumento é implícito no grupo: o `supportIds` da reserva só tem os acessórios. No Transicionais, o instrumento é um support-type `instrumento`. Ao enviar uma presença com grupo, o `supportTypeIds` leva o id do item de instrumento do catálogo do evento cujo `groupIds` contém o grupo, mais os acessórios. Grupo sem item de instrumento no catálogo (B3) → só os acessórios. |

## F. Ids para debug

| # | Regra |
|---|---|
| F1 | Ao criar o encontro no Transicionais, o nome vai como `<nome>#<id do Hormônios>` (ex.: `Ensaio#3f2a…`), para achar o ensaio do Hormônios pelo admin de lá. A busca do encontro recém-criado (D18) compara com esse mesmo nome. |
| F2 | Na leitura do encontro, o sufixo `#<id>` sai do nome. Assim o nome gravado no Hormônios continua `<nome>`, e o próximo ensaio, criado a partir do atual, não acumula sufixos. |
| F3 | O `GET /api/admin/ensaio` (e o `GET /api/ensaio`) passa a devolver também o `externalPublicId` do evento. |
| F4 | Na Produção, com `?debug=1`, o título "PRÓXIMO ENSAIO" mostra `transicionaisEventId` (`integrationId`), `transicionaisPublicEventId` (`externalPublicId`) e `hormoniosId` (`id`). Id do Transicionais ausente aparece como `NÃO_INTEGRADO`. O código de debug da Home não muda. |

## E. Fora desta tarefa

| # | Regra |
|---|---|
| E1 | `deleteEvent` não volta. |
| E2 | Em aberto, sem decisão: a renovação do token no 403 e o `x-forwarded-for`; a tradução `SEND_REJECTIONS` das recusas da reserva. |
