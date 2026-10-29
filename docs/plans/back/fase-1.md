# Back — Fase 1: o ensaio, a reserva e a Produção no Supabase

> Cada história diz o que foi preciso criar em cada camada. O que outra história já criou só é
> citado. O que cada usecase faz está em [`docs/usecases/`](../../usecases/README.md). O detalhe para agente
> (formatos, erros, regras numeradas): [`spec/fase-1.md`](../../spec/fase-1.md#back--fase-1).

**Camadas:** rota (`api/`) → resposta ou pedido (`api/_responses/`, `api/admin/_requests/`) →
usecase → domain → repo → banco (`supabase/migrations/`). Cookies e sessão ficam em `http/`.

## Como pessoa, quero ver o ensaio atual

Criados:
- **Domain** [`Event`](../../../src/bff/domain/Event.ts): o ensaio, os grupos e o catálogo
  (instrumentos e acessórios), com a conta do que está livre.
- **Banco** [`v1__create_event.sql`](../../../supabase/migrations/v1__create_event.sql): as tabelas
  `event`, `"user"` e `attendance`.
- **Repo** [`HormoniosRepository`](../../../src/bff/repos/supabase/HormoniosRepository.ts):
  o ensaio atual (o último criado) e as presenças dele.
- **Usecase** [`FindingPublicEventUsecase`](../../usecases/ensaio.md).
- **Resposta** `EventResponse` e **rota** `GET /api/ensaio`.

O público vê local, data, horário, quantas pessoas vão e o que ainda está livre.

## Como pessoa, quero confirmar presença ou reservar um instrumento

Criados:
- **Domain** [`User`](../../../src/bff/domain/User.ts) e
  [`Attendance`](../../../src/bff/domain/Attendance.ts).
- **Repo:** buscar e gravar a pessoa e a presença.
- **Usecases** [`FindingUserUsecase`, `CreatingOrUpdateUserUsecase` e
  `CreatingOrUpdatingAttendanceUsecase`](../../usecases/reservas.md).
- **Cookies** `hg_user` (quem é a pessoa) e `hg_device` (o aparelho).
- **Resposta** `UserResponse` e `AttendanceResponse`, e **rota** `POST /api/reserva`.

Já existiam: `Event` e as tabelas.

A pessoa informa e-mail, nome e pronome, e escolhe só a presença ou um instrumento com acessórios.
O BFF confere as vagas antes de gravar.

## Como pessoa, quero desfazer a minha reserva

Criada: a **rota** `POST /api/reserva/desfazer`.

Já existiam: o usecase da reserva e todo o resto. Desfazer é a mesma operação de reservar:
desfazer o instrumento mantém a presença, e desfazer a presença vira "não vou".

## Como pessoa, quero ver as minhas reservas

Criados:
- **Usecase** [`FindingUserBookingUsecase`](../../usecases/reservas.md).
- **Resposta** `UserBookingResponse`, com o e-mail mascarado e o `emailHash`
  ([`lib/hash.ts`](../../../src/bff/lib/hash.ts)), e **rota** `GET /api/minhas-reservas`.

Já existiam: `User`, `Attendance`, o repo e o cookie `hg_user`.

## Como Produção, quero entrar com a chave

Criados: a sessão `hg_admin` ([`http/admin-session.ts`](../../../src/bff/http/admin-session.ts))
e a **rota** `POST /api/admin/entrar`. Não tem usecase.

## Como Produção, quero ver o ensaio com quem vai

Criados:
- **Domain** [`ManagerEvent`](../../../src/bff/domain/ManagerEvent.ts): o ensaio e as
  pessoas com as presenças.
- **Repo:** as pessoas do ensaio; o ensaio padrão do Bloquinho para a base vazia
  ([`mock/emptyState.json`](../../../src/bff/repos/supabase/mock/emptyState.json)).
- **Usecase** [`FindingInternalEventUsecase`](../../usecases/producao.md).
- **Resposta** `ManagerEventResponse` e **rota** `GET /api/admin/ensaio`.

Já existiam: `Event`, `User`, `Attendance` e a sessão da Produção.

## Como Produção, quero editar o ensaio

Criados:
- **Pedido** [`EventRequest`](../../../api/admin/_requests/EventRequest.ts): o corpo vira um `Event`.
- **Repo:** atualizar o ensaio.
- **Usecase** [`UpdatingInternalEventUsecase`](../../usecases/producao.md) e **rota**
  `PUT /api/admin/ensaio`.

Já existiam: `ManagerEvent` e a resposta da Produção.

Data, horário, local, link do WhatsApp, abrir e fechar as reservas e o estoque.

## Como Produção, quero encerrar o ensaio e criar o próximo

Criados: **repo** criar o ensaio, **usecase** [`CreatingInternalEventUsecase`](../../usecases/producao.md)
e **rota** `POST /api/admin/novo-ensaio`.

Já existiam: o `EventRequest` e a `EventResponse`. O ensaio novo vira o atual, e o anterior fica
como histórico.

## Como time, quero achar os erros nos logs

Criado: o padrão de log em [`lib/logger.ts`](../../../src/bff/lib/logger.ts), com o
contexto (`Event`, `User`, `Attendance`, `HormoniosRepository`). Cada erro conhecido é logado no
usecase, com o id do Hormônios, e a falha do banco é logada no repo.
