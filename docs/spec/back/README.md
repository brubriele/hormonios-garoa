# Spec do back (BFF em `api/` e `src/serve-utils/`)

> O que já está implementado. Cada spec traz só o necessário para implementar aquela entrega, com
> pouco código. Planos (antes de implementar): [`docs/plans/README.md`](../../plans/README.md).

**Atual:** [fase-2.md](fase-2.md)

## Changelog

| Spec | Data | Resumo |
|---|---|---|
| fase-1.md | 2026-10-24 | Primeira versão: BFF na Vercel com Supabase e sem login, com 8 rotas, a função reservar e os cookies hg_device e hg_admin. |
| fase-2.md | 2026-10-25 | Integração com o Transicionais: retrato com trava e `stale`, estoque pelas assistências (E2.9), Produção repassada, envio da reserva com `PENDING`/`SYNCED`/`REJECTED`, crons e webhooks. Docs de usecase em `usecases/`. |
| fase-2.md | 2026-10-25 | Refatoração para o padrão de camadas, sem mudar as rotas: `InfraError` (500 com `key` no log), logger JSON, schemas zod em `responses/`/`requests/`, conta das vagas nos models, respostas como models montados por `usecases/mappers/`, `transicionais-id.ts` e as decisões do envio no usecase. |
| fase-2.md | 2026-10-26 | "Encerrar" não apaga o antigo; o refresh segue o encontro do retrato. Produção com o Transicionais fora: estoque e "Encerrar" vão para `hg_pending_writes` e o cron envia (D51–D53, migration 0009). Renomeação: `Booking`, `CurrentEventSummary`, usecases em gerúndio por contexto (`booking/`, `event/`, `sync/`). |
| fase-2.md | 2026-10-26 | Renomeação dos models (`Summary*`, `Public*`, `Instrument`/`Accessory`, `LoanCatalog`, `PendingSync`…), com a migration 0011: `hg_pending_syncs`, `claim_syncs`, `marcar_sync_pendente`, `kind` `STOCK_UPDATE`/`EVENT_CREATION` e o retrato com `instruments`/`accessories`. Key de erro `EVENT_CREATION_PENDING_ERROR`. |
