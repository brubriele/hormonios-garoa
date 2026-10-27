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
  tentativas; webhook do Transicionais para encontro, pessoa e presença; job que reenvia a fila.
- **Alteradas:** criar ensaio, gravar pessoa e reservar passam a enviar ao Transicionais; os logs
  ganham os contextos `Sync`, `Job` e `TransicionaisRepository`.
- **Removidas:** —
