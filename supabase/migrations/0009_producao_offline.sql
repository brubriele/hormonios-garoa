-- Produção com o Transicionais fora (D51–D53 de docs/plans/bff-fase-2-duvidas.md).
-- Igual às reservas: grava local, tenta na hora e o cron (/api/cron/sync) envia depois.
--   SUPPORT_CAPACITY: o estoque de uma assistência (target = supportId). Uma pendente por assistência:
--     a mudança nova troca a pendente (vale o último valor).
--   NEXT_EVENT: o "Encerrar ensaio" (target = 'event'). O próximo nasce só no local (external_id null,
--     dia local) e o cron o cria no Transicionais. Um aberto por vez (PENDING ou MANUAL_RETRY, D51).
-- status: PENDING (o cron envia), SYNCED, REJECTED (o Transicionais recusou a regra, D52) e
-- MANUAL_RETRY (400, 409 ou 422: fora do cron até o ajuste manual, D50).

create table if not exists hg_pending_writes (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('SUPPORT_CAPACITY', 'NEXT_EVENT')),
  target text not null,
  data jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SYNCED', 'REJECTED', 'MANUAL_RETRY')),
  sync_error text,                              -- key do Hormônios (REJECTED)
  error_cause jsonb,                            -- o erro do Transicionais como veio (D50)
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now() -- trava do envio, como em hg_attendances
);

create unique index if not exists hg_pending_writes_pending_idx
  on hg_pending_writes (kind, target) where status = 'PENDING';
create index if not exists hg_pending_writes_claim_idx on hg_pending_writes (status, next_attempt_at);

alter table hg_pending_writes enable row level security;

-- ---------------------------------------------------------------------------
-- estoque_pendente: enfileira o estoque de uma assistência e grava o retrato com ele (p_data, montado
-- pelo usecase). A pendente da mesma assistência é trocada. O whatsappUrl fica o gravado.
-- ---------------------------------------------------------------------------

create or replace function estoque_pendente(p_support_id text, p_capacity int, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row hg_current_event;
begin
  select * into v_row from hg_current_event where id = 1 for update;

  insert into hg_pending_writes (kind, target, data)
  values ('SUPPORT_CAPACITY', p_support_id, jsonb_build_object('supportId', p_support_id, 'capacity', p_capacity))
  on conflict (kind, target) where status = 'PENDING'
  do update set data = excluded.data, attempts = 0, next_attempt_at = now(), updated_at = now();

  update hg_current_event
    set data = p_data || jsonb_build_object('whatsappUrl', coalesce(v_row.data ->> 'whatsappUrl', '')),
        updated_at = now()
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- encerrar_local: o "Encerrar ensaio" com o Transicionais fora. Troca o retrato pelo próximo (local:
-- external_id, version e hash null) e enfileira o NEXT_EVENT. Já há um aberto: NEXT_EVENT_PENDING.
-- ---------------------------------------------------------------------------

create or replace function encerrar_local(p_data jsonb, p_write jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row hg_current_event;
begin
  select * into v_row from hg_current_event where id = 1 for update;

  if exists (
    select 1 from hg_pending_writes
    where kind = 'NEXT_EVENT' and status in ('PENDING', 'MANUAL_RETRY')
  ) then
    raise exception 'NEXT_EVENT_PENDING';
  end if;

  update hg_current_event
    set data = p_data || jsonb_build_object('whatsappUrl', coalesce(v_row.data ->> 'whatsappUrl', '')),
        external_id = null,
        version = null,
        hash = null,
        updated_at = now()
  where id = 1;

  insert into hg_pending_writes (kind, target, data) values ('NEXT_EVENT', 'event', p_write);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_escritas: pega até p_limit pendentes vencidas (o NEXT_EVENT primeiro) e adia 2 min.
-- for update skip locked: duas execuções nunca pegam a mesma linha.
-- ---------------------------------------------------------------------------

create or replace function claim_escritas(p_limit int)
returns setof hg_pending_writes
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select w.id
    from hg_pending_writes w
    where w.status = 'PENDING'
      and w.next_attempt_at <= now()
    order by (w.kind = 'NEXT_EVENT') desc, w.created_at, w.id
    limit greatest(coalesce(p_limit, 0), 0)
    for update skip locked
  )
  update hg_pending_writes w
    set next_attempt_at = now() + interval '2 minutes'
  from picked
  where w.id = picked.id
  returning w.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- marcar_escrita: grava o resultado de um envio, só se a linha ainda é a enviada (updated_at =
-- p_updated_at) e continua PENDING.
--   SYNCED       -> status SYNCED, sem erro;
--   REJECTED     -> status REJECTED com a key; no estoque, o hash do retrato vai a null, para o próximo
--                   refresh regravar o valor do Transicionais (D52);
--   MANUAL_RETRY -> status MANUAL_RETRY com o erro como veio (D50);
--   BACKOFF      -> continua PENDING, attempts + 1 e espera 1, 2, 4… min, até 30 min.
-- Devolve true quando gravou. false = a linha mudou durante o envio (o cron envia o valor novo).
-- ---------------------------------------------------------------------------

create or replace function marcar_escrita(
  p_id uuid,
  p_updated_at timestamptz,
  p_mode text,
  p_error text default null,
  p_error_cause jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row hg_pending_writes;
begin
  if p_mode not in ('SYNCED', 'REJECTED', 'MANUAL_RETRY', 'BACKOFF') then
    raise exception 'INVALID_SYNC_MODE';
  end if;

  select * into v_row
  from hg_pending_writes
  where id = p_id
    and updated_at = p_updated_at
    and status = 'PENDING'
  for update;

  if not found then
    return false;
  end if;

  if p_mode = 'BACKOFF' then
    update hg_pending_writes
      set attempts = attempts + 1,
          next_attempt_at = now() + least(power(2, attempts), 30) * interval '1 minute',
          error_cause = coalesce(p_error_cause, error_cause)
    where id = p_id;

    return true;
  end if;

  update hg_pending_writes
    set status = p_mode,
        sync_error = case when p_mode = 'REJECTED' then p_error else null end,
        error_cause = case when p_mode = 'SYNCED' then null else p_error_cause end
  where id = p_id;

  if p_mode = 'REJECTED' and v_row.kind = 'SUPPORT_CAPACITY' then
    update hg_current_event set hash = null where id = 1;
  end if;

  return true;
end;
$$;

revoke execute on function estoque_pendente(text, int, jsonb) from public, anon, authenticated;
revoke execute on function encerrar_local(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function claim_escritas(int) from public, anon, authenticated;
revoke execute on function marcar_escrita(uuid, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function estoque_pendente(text, int, jsonb) to service_role;
grant execute on function encerrar_local(jsonb, jsonb) to service_role;
grant execute on function claim_escritas(int) to service_role;
grant execute on function marcar_escrita(uuid, timestamptz, text, text, jsonb) to service_role;
