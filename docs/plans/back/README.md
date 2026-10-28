# Plano do back (BFF em `api/` e `src/serve-utils/`)

## Changelog

### [fase-1](fase-1.md) — 2026-10-27

- **Adicionadas:** ver o ensaio atual; confirmar presença e reservar instrumento com acessórios;
  desfazer a reserva; ver as minhas reservas; entrar na Produção; ver o ensaio com quem vai;
  editar o ensaio e o estoque; encerrar o ensaio e criar o próximo; logs de erro por contexto.
- **Alteradas:** —
- **Removidas:** —

### [fase-2](fase-2.md) — 2026-10-27

- **Adicionadas:** envio ao Transicionais do ensaio, da pessoa e da presença, com fila e novas
  tentativas; webhook do Transicionais para encontro, pessoa e presença; job que reenvia a fila;
  chave da Produção que desliga o Transicionais de propósito (`GET`/`PUT /api/admin/integracao`).
- **Alteradas:** criar ensaio, gravar pessoa e reservar passam a enviar ao Transicionais; os logs
  ganham os contextos `Sync`, `Job` e `TransicionaisRepository`; a presença lida com grupo ou
  suporte fora do evento responde 422 `INVALID_CACHE_STATE_ERROR` em vez de 500; as rotas pedem
  o usecase ao `Envolviment` (singleton lazy: client, session, repos e usecase montados uma vez por
  instância, e o SDK do Supabase não é mais recriado a cada pedido); o token do Transicionais vira
  campo da `TransicionaisSession`; o padrão ganha as regras G9 (no máximo 2 métodos encadeados), G10
  (`new` só num `const`) e G11 (sem `return await`), conferidas pelo `check.cjs`; o `Envolviment.make` passa a ser `async` e injeta o Transicionais
  desligado; com a chave desligada, o job responde 503 sem tocar a fila.
- **Removidas:** —
