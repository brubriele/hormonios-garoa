# spec-3 — Transicionais desligado de propósito

> **Concluído em 2026-10-28.** Tarefa: [`plans/back/T3-transicionais-desligado.md`](../plans/back/T3-transicionais-desligado.md).
> Regras de [`fase-2.md`](fase-2.md) citadas como "fase-2 E3".

## Desenho

```
.env  TRANSICIONAIS_ENABLED=false
  │
  ▼
api/*.ts ── Envolviment.make(token)
              │ usa o Transicionais? → isTransicionaisEnabled()            (B1)
              ├── ligado    → TransicionaisRepo(HttpClient, Session(HttpClient))
              └── desligado → TransicionaisRepo(FakeHttpClient, Session(FakeHttpClient))
                                │  503 na hora, sem fetch nem login         (C1)
                                ▼
                              repo → UpstreamUnavailableError (fase-2 T3)
                                │
        ┌───────────────────────┼──────────────────────────┐
        ▼                       ▼                          ▼
  envio (criar ensaio,     webhook                     job (cron)
  pessoa, reserva)         { PENDING, false }          1ª linha: desligado → 503,
  grava local, PENDING     (fase-2 W4)                 sem tocar a fila   (D1)
  (fase-2 E3)
                                                        religou → próximo cron
                                                        esvazia a fila     (D2)
```

## A. A chave

| # | Regra |
|---|---|
| A1 | **Env** `TRANSICIONAIS_ENABLED`: `false` desliga; ausente ou outro valor = ligado. Lida por `isTransicionaisEnabled()` (`lib/upstream.ts`), sem consulta ao banco. |
| A2 | Muda pelo painel da Vercel/Cloudflare e vale nas instâncias novas (próximo deploy ou reinício). No dev, pelo `.env.local`. |

| Env | Uso |
|---|---|
| `TRANSICIONAIS_ENABLED` | `false` desliga o Transicionais de propósito (A1); ausente = ligado |

## B. Montagem (`Envolviment`)

| # | Regra |
|---|---|
| B1 | No `make` de um usecase que usa o Transicionais (reservar e desfazer, ver e criar o ensaio na Produção, job e webhook), o `Envolviment` lê `isTransicionaisEnabled()`. |
| B2 | Ligado → `TransicionaisRepo(HttpClient, TransicionaisSession(HttpClient))`; desligado → `TransicionaisRepo(FakeHttpClient, TransicionaisSession(FakeHttpClient))`. As duas montagens são lazy. |
| B3 | O usecase fica no cache por `token` + estado (`<token>:on` ou `<token>:off`). Usecase que não usa o Transicionais fica só pelo `token`. |

## C. Transicionais desligado responde "fora do ar"

| # | Regra |
|---|---|
| C1 | `FakeHttpClient` implementa `IHttpClient` (o mesmo contrato do `HttpClient`), loga em `debug` e devolve `{ status: 503, error }` sem `fetch`. |
| C2 | O repo converte o 503 em `UpstreamUnavailableError` (fase-2 T3). Nenhum usecase sabe que é de propósito. |
| C3 | Os usecases de envio seguem o plano de falha que já têm: gravam local e deixam `PENDING` (fase-2 E3), sem esperar o timeout nem fazer login. |
| C4 | O webhook que precisa buscar no Transicionais responde `{ PENDING, false }` (fase-2 W4). |

## D. Job

| # | Regra |
|---|---|
| D1 | A 1ª linha do `JobUsecase`, depois do `track`, chama `isTransicionaisEnabled()`. Desligado → `UpstreamUnavailableError` (503 `UPSTREAM_UNAVAILABLE_ERROR`), sem ler nem gravar a fila: as tentativas não andam. |
| D2 | Ao religar, o próximo cron esvazia a fila. Item criado com o Transicionais desligado fica com `tentatives = 1` e `nextSyncAt` daqui a 1 min: o job não roda enquanto está desligado (D1). |

## E. Tempo das chamadas no dev

| # | Regra |
|---|---|
| E1 | Só no `yarn dev` (`vite.config.js`): cada rota loga `[api] <método> <url>` ao chegar e, ao terminar, o status e o tempo em ms. |
| E2 | O `fetch` global é embrulhado: chamada à `SUPABASE_URL` loga `[supabase]`, à `TRANSICIONAIS_URL` loga `[transicionais]`, com método, caminho (até 120 caracteres), status (0 = sem resposta) e ms. Outras URLs passam sem log. |
| E3 | Cores: status 2xx verde, 4xx amarelo, 5xx e 0 vermelho; tempo verde abaixo de 300 ms, amarelo até 1 s, vermelho acima. |

## Limites conhecidos

- Desligar não vale na hora: a instância que já montou o usecase segue com o estado de quando
  nasceu até o próximo deploy ou reinício (A2).
- Os comentários no código ainda citam os ids antigos da fase 2: `// K1` (`lib/upstream.ts`),
  `// K3` (`Envolviment.ts`), `// K4` (`FakeHttpClient.ts`, `IHttpClient.ts`) e `// J0`
  (`JobUsecase.ts`). Os novos são `spec-3 A1`, `spec-3 B2`, `spec-3 C1` e `spec-3 D1`.
