# Ensaio

> Atualizado em 2026-10-26 (refactor do domain, [`create-domain.md`](../../../plans/create-domain.md)).

## FindingPublicEventUsecase — `GET /api/ensaio`

> [`usecases/event/FindingPublicEventUsecase.ts`](../../../../src/serve-utils/usecases/event/FindingPublicEventUsecase.ts)

**Contexto.** A tela pública mostra o ensaio atual: local, data, grupos e o catálogo com o que
ainda está livre. Quem chama é o front, sem sessão.

**Decisão.**
- O ensaio atual é o evento mais recente por `created_at` (`findCurrentEvent`, D2). Sem evento →
  `NotFoundError`.
- Lê as presenças do evento e devolve `event.withAttendances(attendances, false)` (F4): o
  `goingCount`, o `stock.used`/`stock.free` do catálogo e, por ser a visão do público, sem o
  `capacity` dos grupos.
- Conta só as presenças `vou` que não estão `REJECTED`.
- A rota responde o `EventResponse.fromDomain(event)` ([`api/_responses/`](../../../../api/_responses/)):
  o model sem nenhum `metadata`, que é dado do Transicionais e pode ser sensível. O que a tela usa
  fica na raiz do domain, preenchido em memória a partir do metadata (`Event.name`, `categoryId`,
  `endTime`, `description`, `integrationId`; `EventGroup.active`; `EventCatalog.type`, `groupIds`;
  `Attendance.answer`, `sync`). O banco continua com o `toJson()` inteiro. O mesmo vale para todas
  as rotas (`UserResponse`, `AttendanceResponse`, `ManagerEventResponse`).

**Consequências.**
- A conta das vagas é do domain (`Event`, `EventCatalog`, `EventGroup`), não do usecase: o mesmo
  `withAttendances` serve à Produção (com `capacity`) e às validações da reserva.
- Não fala com o Transicionais: o que vem de lá entra na base pelo webhook
  ([`sincronizacao.md`](sincronizacao.md)).
