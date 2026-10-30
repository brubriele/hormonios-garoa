# Planos

> Como o projeto evoluiu, em ordem. As fases são concluídas e não recebem tarefa nova; cada
> tarefa nova é um `T<n>` com a tarefa em `back/` ou `front/` e as regras em
> [`spec/`](../spec/) (`spec-<n>`). O que cada usecase faz está em [`usecases/`](../usecases/README.md).

| # | Tarefa | Plano | Spec | Status |
|---|---|---|---|---|
| Fase 1 | Usecases sobre o contrato novo e telas falando com o BFF | [back](back/fase-1.md), [front](front/fase-1.md) | [`fase-1.md`](../spec/fase-1.md) | Concluído em 2026-10-27 |
| Fase 2 | Sincronização com o Transicionais | [back](back/fase-2.md), [front](front/fase-2.md) | [`fase-2.md`](../spec/fase-2.md) | Concluído em 2026-10-27 |
| T3 | Transicionais desligado | [back](back/T3-transicionais-desligado.md) | [`spec-3-transicionais-desligado.md`](../spec/spec-3-transicionais-desligado.md) | Concluído em 2026-10-28 |
| T4 | Grupos e catálogo integrados ao Transicionais | [back](back/T4-integrate-groupos-catalog.md) | [`spec-4-integrate-groupos-catalog.md`](../spec/spec-4-integrate-groupos-catalog.md) | Concluído em 2026-10-28 |
| T5 | Entrada do cron (`cronjob/handler.ts`) e `deploy/` por ambiente (dev, Vercel) | [back](back/T5-envolviment-app.md) | [`spec-5-envolviment-app.md`](../spec/spec-5-envolviment-app.md) | Concluído em 2026-10-28 |
| T6 | cronjob: o job na Cloudflare (`deploy/cloudflare/`, `scheduled()` → handler) | [back](back/T6-cronjob.md) | [`spec-6-cronjob.md`](../spec/spec-6-cronjob.md) | Concluído em 2026-10-28 |
| T7 | webhook: o webhook do Transicionais como worker separado | — | — | Próxima |
| T8 | Leitura do evento, das presenças e das pessoas numa query só, com a `current_event` | [back](back/T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md), [front](front/T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md) | [`spec-8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md`](../spec/spec-8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md) | Concluído em 2026-10-30 |
| T9 | Identificar a pessoa na presença; instrumento só com o aparelho reconhecido | [back](back/T9-identifying-user.md), [front](front/T9-identifying-user.md) | [`spec-9-identifying-user.md`](../spec/spec-9-identifying-user.md) | Concluído em 2026-10-30 |

Changelog por fase: [`back/README.md`](back/README.md) e [`front/README.md`](front/README.md).

## Outros planos

Sem número de tarefa: [`deploy/`](deploy/README.md) (deploy por provedor) e
[`transicionais/`](transicionais/) (setup do Transicionais e OAuth2).
