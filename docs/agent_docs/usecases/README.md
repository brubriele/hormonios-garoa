# Usecases (para agente)

> O que cada usecase faz hoje, um arquivo por usecase, com o link para o código. O padrão de código
> está em [`backend/usecases.md`](../backend/usecases.md); a doc para pessoas, em
> [`docs/usecases/`](../../usecases/README.md).
>
> Cada arquivo tem as regras de hoje e, depois de `---`, **Alterações em progresso**: o que a
> tarefa em andamento muda, citando a spec. Ao concluir a tarefa, as regras de lá substituem as de
> cima e a seção sai.

| Usecase | Rota | Em progresso |
|---|---|---|
| [`FindingPublicEventUsecase`](FindingPublicEventUsecase.md) | `GET /api/ensaio` | — |
| [`UpdatingInternalEventUsecase`](UpdatingInternalEventUsecase.md) | `PUT /api/admin/ensaio` | — |
| [`EventJobUsecase`](EventJobUsecase.md) | `GET /api/cron/sync?type=event` | — |
| [`CreatingOrUpdatingAttendanceUsecase`](CreatingOrUpdatingAttendanceUsecase.md) | `POST /api/reserva`, `POST /api/reserva/desfazer` | — |
| [`AttendanceJobUsecase`](AttendanceJobUsecase.md) | `GET /api/cron/sync?type=attendance` | — |
