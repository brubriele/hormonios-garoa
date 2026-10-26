# Sincronização

> Atualizado em 2026-10-25 (fase 2).

## SyncPendingAttendances — `GET /api/cron/sync`

> [`usecases/sync-pending-attendances.ts`](../../../../src/serve-utils/usecases/sync-pending-attendances.ts)

**Contexto.** As reservas que ficaram `PENDING` (Transicionais fora, lento ou ocupado) precisam
chegar lá depois, sem duplicar.

**Decisão.**
- Com retrato local da fase 1, não faz nada.
- `claim_pending` pega até 10 linhas vencidas de todos os dias do Transicionais (`skip locked`, adia
  2 min, D39). As de ensaio antigo da fase 1 (`day_key` UUID) ficam de fora (D45, revê a D11).
- Envia cada uma pelo `SendAttendanceUsecase`, em paralelo e sem IP. Responde a contagem.

**Consequências.**
- Duas execuções nunca pegam a mesma linha. A trava do `updated_at` evita gravar `SYNCED` sobre uma
  mudança feita durante o envio.
- Ninguém chama a rota sozinho até existir o Worker (onda 4).

## ReceiveTransicionaisWebhook — `POST /api/webhooks/transicionais`

> [`usecases/receive-transicionais-webhook.ts`](../../../../src/serve-utils/usecases/receive-transicionais-webhook.ts)

> **Em rascunho:** marcado com `@deprecated` até a revisão da Bea. Não está em uso.

**Contexto.** O Transicionais avisa mudanças do encontro e das respostas (R11, R12). A rota confere o
JWT antes (`verifyWebhookJwt`).

**Decisão.**
- O repo do Transicionais lê o corpo cru. Grava o `deliveryId`; repetido, não processa. Falhou ao
  processar: apaga o registro e relança, para o reenvio passar (D38).
- `event.updated`: grava com `gravar_retrato` (mesma trava). Outro encontro: ignora. Não deu para
  mapear: chama o `RefreshCurrentEventUsecase` (D35).
- `validation.changed`: `aplicar_validacao` (trava de `changedAt` e da mudança local mais nova), sem
  as assistências de instrumento em `supportIds` (D37). Depois, as vagas por `gravar_vagas` (D36).

**Consequências.**
- Repetido ou fora de ordem não muda nada. Pessoa desconhecida ou sem linha no dia não cria linha (B6, D37).
- Nada foi testado com o Transicionais: o formato dos webhooks é o do plano.
