# Plano do front (`index.html`, `app.js` e telas)

## Changelog

### [fase-1](fase-1.md) — 2026-10-27

- **Adicionadas:** as telas falando com o BFF: ver o ensaio, confirmar presença, reservar
  instrumento com acessórios, ver e desfazer as minhas reservas, entrar na Produção, editar o
  ensaio e o estoque, abrir e fechar as reservas e encerrar o ensaio.
- **Alteradas:** —
- **Removidas:** —

### [fase-2](fase-2.md) — 2026-10-27

- **Adicionadas:** o código do ensaio em modo debug.
- **Alteradas:** a presença recusada pelo Transicionais deixa de contar.
- **Removidas:** —

### [T8 — hormonios-repo-otimization-event-read-for-event-and-users-attendance](T8-hormonios-repo-otimization-event-read-for-event-and-users-attendance.md) — 2026-10-30

- **Adicionadas:** as abas ATUAL / PRÓXIMO na Produção; o próximo ainda não criado aparece como
  formulário com a data do atual + 7 dias, o mesmo horário e o mesmo local.
- **Alteradas:** liberar e fechar as reservas e encerrar o ensaio chamam as rotas novas; as chamadas
  usam as rotas em português no padrão REST; a escrita do ensaio não manda mais `bookingOpen`.
- **Removidas:** —

### [T9 — identifying-user](T9-identifying-user.md) — 2026-10-30

- **Adicionadas:** —
- **Alteradas:** reservar o instrumento sem a pessoa reconhecida faz duas chamadas: a presença e
  depois o instrumento.
- **Removidas:** —
