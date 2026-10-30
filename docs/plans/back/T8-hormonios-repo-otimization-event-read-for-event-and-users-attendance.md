# Back — T8: hormonios-repo-otimization-event-read-for-event-and-users-attendance

> **Concluído em 2026-10-30.** O que cada usecase faz: [`docs/usecases/ensaio.md`](../../usecases/ensaio.md),
> [`producao.md`](../../usecases/producao.md) e [`reservas.md`](../../usecases/reservas.md). O
> detalhe para agente:
> [`spec/spec-8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md`](../../spec/spec-8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md).

## Camadas novas

A tabela `current_event` e a função `update_current_event`, em
[`supabase/migrations/v3__create_current_event.sql`](../../../supabase/migrations/v3__create_current_event.sql).

## Como Produção, quero liberar e fechar as reservas sem mexer no ensaio

Criado: um endpoint só para liberar e fechar, que marca `current_event.isActive` pela função
`update_current_event`.

Alterados: `bookingOpen` sai do body de `PUT` e do `POST /api/admin/ensaio`
(`UpdatingInternalEventUsecase`, `CreatingInternalEventUsecase`), e as leituras respondem
`bookingOpen` a partir de `isActive`.

Liberar e fechar valem para o ensaio atual. O atual só muda no "Encerrar ensaio e criar próximo".

## Como Produção, quero ver o ensaio atual e o próximo

Criado: no **repo**, o método que cria a linha da `current_event`.

Alterados: o `CreatingInternalEventUsecase` cria o novo ensaio como próximo (a linha nova e o
`nextEventId` no atual). O `createMockEvent` também cria a linha. O `FindingInternalEventUsecase`
recebe o `FindingInternalFilter` e devolve o atual ou o próximo.

O front ganha a aba **ENSAIO (ATUAL / PRÓXIMO)**, no mesmo padrão visual.

## Como pessoa, quero que o ensaio e as minhas reservas abram rápido

Alterados:
- **repo:** `findCurrentEvent` lê `current_event → event → attendance → user` numa query só, e
  `findUserById(id, event)`, com a mesma assinatura, lê a pessoa e as presenças dela no ensaio numa
  query só;
- **usecases, lado do ensaio:** o get é o `FindingInternalEventUsecase`. O
  `FindingPublicEventUsecase` e o `UpdatingInternalEventUsecase` usam esse get e perdem a leitura
  duplicada;
- **usecases, lado da pessoa:** o get é o `FindingUserBookingUsecase`. O
  `CreatingOrUpdatingAttendanceUsecase` usa esse get e perde a leitura duplicada. O
  `CreatingOrUpdateUserUsecase` lê a pessoa pelo `FindingUserUsecase`.

Saem o `findEventUsers` e a cópia do último evento do Transicionais quando o banco está vazio.

| Rota | Leituras hoje → depois |
|---|---|
| `GET /api/admin/ensaio` | 4 → 1 |
| `GET /api/ensaio` | 2 → 1 |
| `GET /api/membros` | 3 → 2 |
| `POST` e `PATCH /api/membros/reservas` | 3–4 → 2 |

## Roadmap

| Seção do README | Item | T8 |
|---|---|---|
| 2. Ensaios e calendário | Buscar ensaio atual | atende (`isCurrent`) |
| 2. Ensaios e calendário | Buscar próximo ensaio | atende (filtro, aba PRÓXIMO) |
| 2. Ensaios e calendário | Preservar histórico de ensaios | não atende: é do Transicionais |
| 5. Reservas | Garantir concorrência/transação no backend | em parte: só o estado do ensaio (`update_current_event`); a última vaga da reserva continua sem trava |
| 6. Controle de disponibilidade | Endpoint para abrir reservas / para fechar reservas | atende (`PUT /api/admin/reservas`) |
| 6. Controle de disponibilidade | Interface de controle na Produção | atende (botão no endpoint novo) |
| 8. Produção | Próximo ensaio | atende (aba PRÓXIMO) |
| 8. Produção | Criar/encerrar ensaio | atende (`POST /api/admin/ensaio`, `POST /api/admin/ensaio/proximo`) |
| 8. Produção | Abrir/fechar reservas | atende |

Issues: [#7 Controle abrir/fechar reservas](https://github.com/brubriele/hormonios-garoa/issues/7)
(atende); [#3 Integrar ensaios](https://github.com/brubriele/hormonios-garoa/issues/3) e
[#8 Painel Produção](https://github.com/brubriele/hormonios-garoa/issues/8) (em parte);
[#19 Encerramento automático](https://github.com/brubriele/hormonios-garoa/issues/19) (não atende,
aberta nesta tarefa).

Sem issue e não atendido: a trava da última vaga na reserva (5. Reservas) e o histórico de ensaios
(2. Ensaios e calendário).
