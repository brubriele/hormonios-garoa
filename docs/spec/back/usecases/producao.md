# Produção

> Atualizado em 2026-10-25 (fase 2).

O login (`POST /api/admin/entrar`) não tem usecase: a rota usa `isAdminKey` e `createAdminCookie`
de [`http/admin-session.ts`](../../../../src/serve-utils/http/admin-session.ts). As outras rotas
chamam `requireAdmin` antes do usecase.

## AdminSummary — `GET /api/admin/resumo`

> [`usecases/admin-summary.ts`](../../../../src/serve-utils/usecases/admin-summary.ts)

**Contexto.** A tela da Produção: ensaio, estoque e presenças.

**Decisão.**
- Lê o retrato e as linhas do dia no Supabase e responde o model `AdminSummary`, montado pelo
  `AdminSummaryMapper` (`usecases/mappers/admin-summary.mapper.ts`: `stock[]`, E2.9; as vagas vêm dos
  models).
- Não chama o Transicionais.

**Consequências.**
- O estoque é o do último retrato. `reservations` e `attendances` só trazem quem reservou pelo
  Hormônios e não está `REJECTED` (D30).

## UpdateEvent — `PUT /api/admin/ensaio`

> [`usecases/update-event.ts`](../../../../src/serve-utils/usecases/update-event.ts)

**Contexto.** "Salvar ensaio", link, abrir/fechar e estoque, com a mesma tela da fase 1, repassados
ao Transicionais (E2.5).

**Decisão.**
- Valida o parcial. Com retrato local da fase 1, lê o Transicionais antes (senão 503).
- `stocks`: cada id é achado por `CurrentEvent.findStock` (desconhecido ou sem limite: 400). Só os
  que mudaram vão adiante, conferidos por `isBelowReservations(capacity, attendances)` do model
  (rotativo pula; abaixo do ocupado: 409, D29) e gravados com `PUT manager-support-types/{id}`
  (objeto inteiro, `SupportType.withCapacity`, E2.9, D26).
- Local, data, hora e abertura: só a diferença vai ao Transicionais (D1, D7). O encontro de manager
  sai de `findManagedEvent(ref, today())`: a data de busca é do usecase (R12). Data nova move as
  linhas para o dia novo como `PENDING`.
- `EVENT_VERSION_CONFLICT` chega como `VersionConflictError` (`InfraError`): o usecase relê a
  `version` e tenta uma vez mais; repetiu, 500.
- `whatsappUrl` grava local (`gravar_whatsapp`). Por fim, relê o retrato e responde o resumo pelo
  `AdminSummaryMapper`.

**Consequências.**
- Não é atômico: um estoque pode ser gravado e a edição do encontro falhar. Repetir é seguro (D12).
- Fora do ar: 503 `UPSTREAM_UNAVAILABLE_ERROR`.

## NewEvent — `POST /api/admin/novo-ensaio`

> [`usecases/new-event.ts`](../../../../src/serve-utils/usecases/new-event.ts)

**Contexto.** "Encerrar ensaio" cria o próximo encontro no Transicionais (E2.5, E2.7).

**Decisão.**
- Acha o encontro atual com `findManagedEvent(ref, today())` (a data é do usecase, R12).
- Cria o próximo (data + 7 dias, mesmo horário, grupos, assistências e limites, fechado), apaga o
  atual e relê. O novo vira o atual pela listagem (D2). A orquestração (criar, ciclo, grupos, dia,
  publicação) é do usecase; o repo só oferece as operações simples.
- Falha depois de criar: o usecase apaga o recém-criado e relança (D16). Falha ao apagar o antigo:
  só registra no log (D13).
- Responde o resumo pelo `AdminSummaryMapper`, sem presenças.

**Consequências.**
- O resumo volta sem presenças. As linhas antigas ficam no `dayKey` anterior (histórico).
- Por enquanto apaga o antigo; troca pelo "encerrar" do Transicionais quando existir (D2).
