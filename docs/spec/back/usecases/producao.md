# Produção

> Atualizado em 2026-10-25 (fase 2).

O login (`POST /api/admin/entrar`) não tem usecase: a rota usa `isAdminKey` e `createAdminCookie`
de [`http/admin-session.ts`](../../../../src/serve-utils/http/admin-session.ts). As outras rotas
chamam `requireAdmin` antes do usecase.

## AdminSummary — `GET /api/admin/resumo`

> [`usecases/admin-summary.ts`](../../../../src/serve-utils/usecases/admin-summary.ts)

**Contexto.** A tela da Produção: ensaio, estoque e presenças.

**Decisão.**
- Lê o retrato e as linhas do dia no Supabase e monta com `toAdminSummary` (`stock[]`, E2.9).
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
- `stocks`: só os que mudaram, conferidos contra o ocupado (rotativo pula, D29) e gravados com
  `PUT manager-support-types/{id}` (E2.9).
- Local, data, hora e abertura: só a diferença vai ao Transicionais (D1, D7). Data nova move as
  linhas para o dia novo como `PENDING`.
- `whatsappUrl` grava local (`gravar_whatsapp`). Por fim, relê o retrato e responde o resumo.

**Consequências.**
- Não é atômico: um estoque pode ser gravado e a edição do encontro falhar. Repetir é seguro (D12).
- Fora do ar: 503 `UPSTREAM_UNAVAILABLE_ERROR`.

## NewEvent — `POST /api/admin/novo-ensaio`

> [`usecases/new-event.ts`](../../../../src/serve-utils/usecases/new-event.ts)

**Contexto.** "Encerrar ensaio" cria o próximo encontro no Transicionais (E2.5, E2.7).

**Decisão.**
- Cria o próximo (data + 7 dias, mesmo horário, grupos, assistências e limites, fechado), apaga o
  atual e relê. O novo vira o atual pela listagem (D2).
- Falha depois de criar: o repo apaga o recém-criado (D16). Falha ao apagar o antigo: só registra (D13).

**Consequências.**
- O resumo volta sem presenças. As linhas antigas ficam no `dayKey` anterior (histórico).
- Por enquanto apaga o antigo; troca pelo "encerrar" do Transicionais quando existir (D2).
