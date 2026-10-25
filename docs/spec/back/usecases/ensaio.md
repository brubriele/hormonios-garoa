# Ensaio

> Atualizado em 2026-10-25 (fase 2).

## GetEvent — `GET /api/ensaio`

> [`usecases/get-event.ts`](../../../../src/serve-utils/usecases/get-event.ts)

**Contexto.** A tela pública precisa do ensaio e do estoque mesmo com o Transicionais fora.

**Decisão.**
- Lê o retrato do Supabase. Se ele é recente (≤ 5 min) e do Transicionais, responde sem chamar a API.
- Senão, chama o `RefreshCurrentEventUsecase` (criado no construtor, D10). Respondeu: relê e
  responde `stale: false`. Falhou: o último retrato com `stale: true` (R2).
- Monta a resposta com `toEventView` (só grupos ativos) e o `fetchedAt` do retrato.

**Consequências.**
- A tela nunca fica sem ensaio se já houve uma leitura. Sem nenhum retrato e sem a API: 404.
- O front ainda não mostra o `stale` (onda 4).

## RefreshCurrentEvent — `GET /api/cron/event`

> [`usecases/refresh-current-event.ts`](../../../../src/serve-utils/usecases/refresh-current-event.ts)

**Contexto.** A rotina única que resolve o encontro atual e grava o retrato (R13, revista pela E2.7).
Usada pelo cron, por `GetEvent`, pela Produção e pelo webhook `event.updated` (quando o retrato
dele não dá para mapear, D35).

**Decisão.**
- O encontro atual é o primeiro Público da listagem de manager, de hoje em diante (E2.7).
- Fora do ar ou sem encontro: não mexe no retrato e devolve `available: false`.
- Na primeira leitura sobre o retrato local da fase 1, leva as reservas ao dia novo com
  `migrar_fase1` e mapa vazio: as com instrumento viram só presença (E2.2, D15).
- Grava com `gravar_retrato` (trava por `externalId`, `version` e `vacanciesAt`). Devolve `changed`.

**Consequências.**
- Rodar duas vezes dá no mesmo. Trocar o encontro (reset do dev, "Encerrar ensaio") troca o retrato.
- Os ids de grupos e assistências são os do Transicionais: não há de-para.

## Formatos do ensaio e da Produção — sem rota

> [`usecases/event-summary.ts`](../../../../src/serve-utils/usecases/event-summary.ts)

**Contexto.** Não é usecase: é um módulo de funções puras que montam as respostas a partir do model.
Usado por `GetEvent`, `AdminSummary`, `UpdateEvent` e `NewEvent`.

**Decisão.**
- `countTakenByGroup` e `countTakenBySupport`: `taken` do retrato + linhas `vou` locais `PENDING`. No
  retrato local, as linhas `vou` que não estão `REJECTED`. É a mesma conta da função `reservar`.
- `toEventView`: `instruments[]` com os `accessories` que valem para cada um (E2.9, D22).
- `toAdminSummary`: `stock[]` (instrumentos e depois acessórios, com `reservations`) e as presenças
  que contam (D30, D31).

**Consequências.**
- Uma regra de vaga muda aqui e na `reservar` ao mesmo tempo, ou a tela e a recusa divergem.
