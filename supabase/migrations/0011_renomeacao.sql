-- Renomeação dos models (docs/spec/back/fase-2.md): o banco segue os nomes novos.
--   hg_pending_writes -> hg_pending_syncs (PendingSync); kind SUPPORT_CAPACITY -> STOCK_UPDATE
--   (PendingStockUpdate) e NEXT_EVENT -> EVENT_CREATION (PendingEventCreation).
--   claim_escritas -> claim_syncs, marcar_escrita -> marcar_sync_pendente; o erro NEXT_EVENT_PENDING
--   -> EVENT_CREATION_PENDING; o p_write de encerrar_local -> p_sync.
--   jsonb do retrato (hg_current_event.data) e p_taken de gravar_vagas: groups -> instruments e
--   supports -> accessories (Instrument e Accessory). Os ids dentro (groupIds, instrumentSupportId) e
--   o jsonb das reservas (groupId, supportIds) não mudam.

-- ---------------------------------------------------------------------------
-- fila da Produção
-- ---------------------------------------------------------------------------

drop function if exists claim_escritas(text, int);
drop function if exists marcar_escrita(uuid, timestamptz, text, text, jsonb);
drop function if exists encerrar_local(jsonb, jsonb);

alter table hg_pending_writes rename to hg_pending_syncs;
alter index hg_pending_writes_pkey rename to hg_pending_syncs_pkey;
alter index hg_pending_writes_pending_idx rename to hg_pending_syncs_pending_idx;
alter index hg_pending_writes_claim_idx rename to hg_pending_syncs_claim_idx;
alter table hg_pending_syncs rename constraint hg_pending_writes_status_check to hg_pending_syncs_status_check;

alter table hg_pending_syncs drop constraint hg_pending_writes_kind_check;

update hg_pending_syncs
  set kind = case kind when 'SUPPORT_CAPACITY' then 'STOCK_UPDATE' when 'NEXT_EVENT' then 'EVENT_CREATION' else kind end;

alter table hg_pending_syncs
  add constraint hg_pending_syncs_kind_check check (kind in ('STOCK_UPDATE', 'EVENT_CREATION'));

-- ---------------------------------------------------------------------------
-- jsonb do retrato
-- ---------------------------------------------------------------------------

update hg_current_event
  set data = (data - 'groups' - 'supports')
    || jsonb_build_object(
      'instruments', coalesce(data -> 'groups', '[]'::jsonb),
      'accessories', coalesce(data -> 'supports', '[]'::jsonb)
    )
where data ? 'groups' or data ? 'supports';

-- ---------------------------------------------------------------------------
-- estoque_pendente (igual à 0009, com a fila e o kind novos)
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

  insert into hg_pending_syncs (kind, target, data)
  values ('STOCK_UPDATE', p_support_id, jsonb_build_object('supportId', p_support_id, 'capacity', p_capacity))
  on conflict (kind, target) where status = 'PENDING'
  do update set data = excluded.data, attempts = 0, next_attempt_at = now(), updated_at = now();

  update hg_current_event
    set data = p_data || jsonb_build_object('whatsappUrl', coalesce(v_row.data ->> 'whatsappUrl', '')),
        updated_at = now()
  where id = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- encerrar_local (igual à 0009): troca o retrato pelo próximo (local) e enfileira o EVENT_CREATION.
-- Já há um aberto: EVENT_CREATION_PENDING.
-- ---------------------------------------------------------------------------

create or replace function encerrar_local(p_data jsonb, p_sync jsonb)
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
    select 1 from hg_pending_syncs
    where kind = 'EVENT_CREATION' and status in ('PENDING', 'MANUAL_RETRY')
  ) then
    raise exception 'EVENT_CREATION_PENDING';
  end if;

  update hg_current_event
    set data = p_data || jsonb_build_object('whatsappUrl', coalesce(v_row.data ->> 'whatsappUrl', '')),
        external_id = null,
        version = null,
        hash = null,
        updated_at = now()
  where id = 1;

  insert into hg_pending_syncs (kind, target, data) values ('EVENT_CREATION', 'event', p_sync);
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_syncs (era o claim_escritas da 0010): pega até p_limit pendentes vencidas do tipo e adia 2 min.
-- for update skip locked: duas execuções nunca pegam a mesma linha.
-- ---------------------------------------------------------------------------

create or replace function claim_syncs(p_kind text, p_limit int)
returns setof hg_pending_syncs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select w.id
    from hg_pending_syncs w
    where w.kind = p_kind
      and w.status = 'PENDING'
      and w.next_attempt_at <= now()
    order by w.created_at, w.id
    limit greatest(coalesce(p_limit, 0), 0)
    for update skip locked
  )
  update hg_pending_syncs w
    set next_attempt_at = now() + interval '2 minutes'
  from picked
  where w.id = picked.id
  returning w.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- marcar_sync_pendente (era o marcar_escrita da 0009): grava o resultado de um envio, só se a linha
-- ainda é a enviada (updated_at = p_updated_at) e continua PENDING.
--   SYNCED       -> status SYNCED, sem erro;
--   REJECTED     -> status REJECTED com a key; no estoque, o hash do retrato vai a null, para o próximo
--                   refresh regravar o valor do Transicionais (D52);
--   MANUAL_RETRY -> status MANUAL_RETRY com o erro como veio (D50);
--   BACKOFF      -> continua PENDING, attempts + 1 e espera 1, 2, 4… min, até 30 min.
-- Devolve true quando gravou. false = a linha mudou durante o envio (o cron envia o valor novo).
-- ---------------------------------------------------------------------------

create or replace function marcar_sync_pendente(
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
  v_row hg_pending_syncs;
begin
  if p_mode not in ('SYNCED', 'REJECTED', 'MANUAL_RETRY', 'BACKOFF') then
    raise exception 'INVALID_SYNC_MODE';
  end if;

  select * into v_row
  from hg_pending_syncs
  where id = p_id
    and updated_at = p_updated_at
    and status = 'PENDING'
  for update;

  if not found then
    return false;
  end if;

  if p_mode = 'BACKOFF' then
    update hg_pending_syncs
      set attempts = attempts + 1,
          next_attempt_at = now() + least(power(2, attempts), 30) * interval '1 minute',
          error_cause = coalesce(p_error_cause, error_cause)
    where id = p_id;

    return true;
  end if;

  update hg_pending_syncs
    set status = p_mode,
        sync_error = case when p_mode = 'REJECTED' then p_error else null end,
        error_cause = case when p_mode = 'SYNCED' then null else p_error_cause end
  where id = p_id;

  if p_mode = 'REJECTED' and v_row.kind = 'STOCK_UPDATE' then
    update hg_current_event set hash = null where id = 1;
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- gravar_vagas (igual à 0004, com as chaves novas). p_taken:
-- { "instruments": { "<groupId>": n }, "accessories": { "<supportId>": n } }
-- ---------------------------------------------------------------------------

create or replace function gravar_vagas(
  p_day_key text,
  p_vacancies_at timestamptz,
  p_taken jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instruments jsonb := coalesce(p_taken -> 'instruments', '{}'::jsonb);
  v_accessories jsonb := coalesce(p_taken -> 'accessories', '{}'::jsonb);
begin
  update hg_current_event e
    set data = e.data
          || jsonb_build_object(
            'instruments',
            coalesce((
              select jsonb_agg(
                case
                  when v_instruments ? (i.value ->> 'id')
                    then i.value || jsonb_build_object('taken', greatest(0, (v_instruments ->> (i.value ->> 'id'))::int))
                  else i.value
                end
                order by i.ord
              )
              from jsonb_array_elements(e.data -> 'instruments') with ordinality as i(value, ord)
            ), '[]'::jsonb),
            'accessories',
            coalesce((
              select jsonb_agg(
                case
                  when v_accessories ? (a.value ->> 'id')
                    then a.value || jsonb_build_object('taken', greatest(0, (v_accessories ->> (a.value ->> 'id'))::int))
                  else a.value
                end
                order by a.ord
              )
              from jsonb_array_elements(e.data -> 'accessories') with ordinality as a(value, ord)
            ), '[]'::jsonb)
          ),
        vacancies_at = p_vacancies_at,
        updated_at = now()
  where e.id = 1
    and e.external_id is not null
    and e.data ->> 'dayKey' = p_day_key
    and p_vacancies_at > coalesce(e.vacancies_at, '-infinity'::timestamptz);

  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- reservar (igual à 0008, lendo instruments e accessories do retrato)
-- ---------------------------------------------------------------------------

create or replace function reservar(
  p_user_id uuid,
  p_day_key text,
  p_device_id uuid,
  p_data jsonb
)
returns hg_attendances
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event hg_current_event;
  v_data jsonb;
  v_group_id text := p_data ->> 'groupId';
  v_instrument jsonb;
  v_support_ids jsonb := coalesce(p_data -> 'supportIds', '[]'::jsonb);
  v_support_id text;
  v_accessory jsonb;
  v_existing hg_attendances;
  v_taken integer;
  v_result hg_attendances;
begin
  -- 1. trava a linha do ensaio: pedidos ao mesmo tempo esperam um pelo outro
  select * into v_event from hg_current_event where id = 1 for update;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  v_data := v_event.data;

  -- 2. reservas fechadas
  if coalesce((v_data ->> 'bookingOpen')::boolean, false) is not true then
    raise exception 'BOOKING_CLOSED';
  end if;

  -- 3. o ensaio mudou desde que a pessoa abriu a folha
  if (v_data ->> 'dayKey') is distinct from p_day_key then
    raise exception 'EVENT_CHANGED';
  end if;

  -- 4. instrumento (o grupo) existe e está ativo (sem groupId é só presença)
  if v_group_id is not null then
    select i.value into v_instrument
    from jsonb_array_elements(v_data -> 'instruments') as i(value)
    where i.value ->> 'id' = v_group_id;

    if v_instrument is null or coalesce((v_instrument ->> 'active')::boolean, false) is not true then
      raise exception 'INVALID_GROUP';
    end if;
  end if;

  -- 5. acessórios: lista de ids, cada um existe no retrato e vale para o grupo.
  --    Sem grupo (só presença) não tem acessório.
  if jsonb_typeof(v_support_ids) <> 'array' then
    raise exception 'INVALID_SUPPORT';
  end if;

  if v_group_id is null and jsonb_array_length(v_support_ids) > 0 then
    raise exception 'INVALID_SUPPORT';
  end if;

  for v_support_id in select distinct s from jsonb_array_elements_text(v_support_ids) as t(s)
  loop
    select a.value into v_accessory
    from jsonb_array_elements(v_data -> 'accessories') as a(value)
    where a.value ->> 'id' = v_support_id;

    if v_accessory is null then
      raise exception 'INVALID_SUPPORT';
    end if;

    -- groupIds ausente ou vazio vale para todos os grupos
    if jsonb_array_length(coalesce(v_accessory -> 'groupIds', '[]'::jsonb)) > 0
      and not (v_accessory -> 'groupIds') ? v_group_id
    then
      raise exception 'INVALID_SUPPORT';
    end if;
  end loop;

  -- 6. uma reserva "vou" por e-mail no dia (E1.3), exceto presença deste aparelho ganhando
  --    instrumento. Linha REJECTED vale como "nao-vou".
  select * into v_existing
  from hg_attendances
  where user_id = p_user_id and day_key = p_day_key;

  if found
    and v_existing.data ->> 'answer' = 'vou'
    and v_existing.transicionais_sync <> 'REJECTED'
  then
    if not (
      v_existing.device_id = p_device_id
      and v_existing.data ->> 'groupId' is null
      and v_group_id is not null
    ) then
      raise exception 'ALREADY_RESERVED';
    end if;
  end if;

  -- 7. estoque do instrumento: rotativo ou stockTotal null não bloqueia
  if v_group_id is not null
    and coalesce((v_instrument ->> 'rotativo')::boolean, false) is not true
    and (v_instrument ->> 'stockTotal') is not null
  then
    if v_event.external_id is not null then
      select coalesce((v_instrument ->> 'taken')::integer, 0) + count(*) into v_taken
      from hg_attendances
      where day_key = p_day_key
        and data ->> 'answer' = 'vou'
        and data ->> 'groupId' = v_group_id
        and transicionais_sync in ('PENDING', 'MANUAL_RETRY');
    else
      select count(*) into v_taken
      from hg_attendances
      where day_key = p_day_key
        and data ->> 'answer' = 'vou'
        and data ->> 'groupId' = v_group_id
        and transicionais_sync <> 'REJECTED';
    end if;

    if v_taken >= (v_instrument ->> 'stockTotal')::integer then
      raise exception 'SOLD_OUT';
    end if;
  end if;

  -- 8. estoque dos acessórios: mesma conta, por acessório
  for v_support_id in select distinct s from jsonb_array_elements_text(v_support_ids) as t(s)
  loop
    select a.value into v_accessory
    from jsonb_array_elements(v_data -> 'accessories') as a(value)
    where a.value ->> 'id' = v_support_id;

    if coalesce((v_accessory ->> 'rotativo')::boolean, false) is true
      or (v_accessory ->> 'stockTotal') is null
    then
      continue;
    end if;

    if v_event.external_id is not null then
      select coalesce((v_accessory ->> 'taken')::integer, 0) + count(*) into v_taken
      from hg_attendances
      where day_key = p_day_key
        and data ->> 'answer' = 'vou'
        and coalesce(data -> 'supportIds', '[]'::jsonb) ? v_support_id
        and transicionais_sync in ('PENDING', 'MANUAL_RETRY');
    else
      select count(*) into v_taken
      from hg_attendances
      where day_key = p_day_key
        and data ->> 'answer' = 'vou'
        and coalesce(data -> 'supportIds', '[]'::jsonb) ? v_support_id
        and transicionais_sync <> 'REJECTED';
    end if;

    if v_taken >= (v_accessory ->> 'stockTotal')::integer then
      raise exception 'ACCESSORY_SOLD_OUT';
    end if;
  end loop;

  -- 9. grava; o on conflict permite reservar de novo depois de "Não vou" ou de uma recusa
  insert into hg_attendances (user_id, day_key, device_id, data)
  values (p_user_id, p_day_key, p_device_id, p_data || jsonb_build_object('answer', 'vou'))
  on conflict (user_id, day_key) do update
    set data = excluded.data,
        device_id = excluded.device_id,
        transicionais_sync = 'PENDING',
        sync_error = null,
        attempts = 0,
        next_attempt_at = now(),
        updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function estoque_pendente(text, int, jsonb) from public, anon, authenticated;
revoke execute on function encerrar_local(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function claim_syncs(text, int) from public, anon, authenticated;
revoke execute on function marcar_sync_pendente(uuid, timestamptz, text, text, jsonb) from public, anon, authenticated;
revoke execute on function gravar_vagas(text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function reservar(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function estoque_pendente(text, int, jsonb) to service_role;
grant execute on function encerrar_local(jsonb, jsonb) to service_role;
grant execute on function claim_syncs(text, int) to service_role;
grant execute on function marcar_sync_pendente(uuid, timestamptz, text, text, jsonb) to service_role;
grant execute on function gravar_vagas(text, timestamptz, jsonb) to service_role;
grant execute on function reservar(uuid, text, uuid, jsonb) to service_role;
