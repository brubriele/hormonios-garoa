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
  ganham os contextos `Sync`, `Job` e `TransicionaisRepository`; a presença lida com grupo ou
  suporte fora do evento responde 422 `INVALID_CACHE_STATE_ERROR` em vez de 500; as rotas pedem
  o usecase ao `Envolviment` (singleton lazy: client, session, repos e usecase montados uma vez por
  instância, e o SDK do Supabase não é mais recriado a cada pedido); o token do Transicionais vira
  campo da `TransicionaisSession`; o padrão ganha as regras G9 (no máximo 2 métodos encadeados), G10
  (`new` só num `const`) e G11 (sem `return await`), conferidas pelo `check.cjs`.
- **Removidas:** —

### [T3 — transicionais-desligado](T3-transicionais-desligado.md) — 2026-10-28

- **Adicionadas:** a env `TRANSICIONAIS_ENABLED` desliga o Transicionais de propósito; no dev, o
  tempo em ms de cada chamada ao BFF, ao Supabase e ao Transicionais.
- **Alteradas:** o `Envolviment` injeta o Transicionais desligado (`FakeHttpClient`); desligado, o
  job responde 503 sem tocar a fila.
- **Removidas:** —

### [T4 — integrate-groupos-catalog](T4-integrate-groupos-catalog.md) — 2026-10-28

- **Adicionadas:** o estoque editado pelo admin vai para o Transicionais (PUT do support-type), também
  pelo job; o `GET /api/ensaio` com o banco vazio traz o último Público do Transicionais; a presença
  enviada volta com o id do Transicionais; o nome do encontro lá leva `#<id do Hormônios>`; na
  Produção, com `?debug=1`, os ids do ensaio no Transicionais e no Hormônios; a doc viva dos usecases
  em `docs/agent_docs/usecases/`.
- **Alteradas:** o catálogo de instrumento sai dos grupos da publicação e do support-type
  `instrumento` de cada um (o `type` passa de `instrument` para `instrumento`); a presença com grupo
  leva o support-type do instrumento; a publicação vai em `public.groups` e `public.capacity`, com
  todos os grupos (o `public.vacancies` era descartado pelo Transicionais e apagava os grupos); o
  PUT do support-type mantém os `groupIds` dele; o job de evento reenvia a edição em vez de só marcar
  `SYNCED` (fase-2 J6).
- **Removidas:** —
