-- Hash da presença (D49 de docs/plans/bff-fase-2-duvidas.md).
-- Cada item de GET v2/manager-validations/guests traz `hash` (md5): muda quando algum campo da presença
-- muda. O envio grava o hash da presença que deixou lá; antes de enviar, compara a presença de lá com
-- a linha local e, se já é a mesma, marca SYNCED sem reenviar.
--
-- Erro do Transicionais e MANUAL_RETRY (D50): toda falha com resposta do Transicionais grava o erro
-- como veio em error_cause ({ operation, status, body }). 400, 409 ou 422 deixam a linha MANUAL_RETRY:
-- o claim_pending só pega PENDING, então ela sai do cron até alguém ajustar e voltá-la a PENDING.
-- O mesmo vale para a leitura do encontro, na linha do retrato (hg_current_event).

alter table hg_attendances add column if not exists transicionais_hash text;
alter table hg_attendances add column if not exists error_cause jsonb;

alter table hg_attendances drop constraint if exists hg_attendances_transicionais_sync_check;
alter table hg_attendances add constraint hg_attendances_transicionais_sync_check
  check (transicionais_sync in ('PENDING', 'SYNCED', 'REJECTED', 'MANUAL_RETRY'));

alter table hg_current_event add column if not exists sync_status text
  check (sync_status is null or sync_status = 'MANUAL_RETRY');
alter table hg_current_event add column if not exists error_cause jsonb;

drop function if exists marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text);
drop function if exists marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text, text);

-- ---------------------------------------------------------------------------
-- marcar_sync (revista, D49 e D50): igual à 0006, com p_hash no SYNCED, o modo MANUAL_RETRY e o
-- p_error_cause (o erro do Transicionais como veio). SYNCED limpa o error_cause; RETRY e BACKOFF
-- gravam o erro quando ele veio.
-- ---------------------------------------------------------------------------

create or replace function marcar_sync(
  p_id uuid,
  p_updated_at timestamptz,
  p_mode text,
  p_order_id text default null,
  p_changed_at timestamptz default null,
  p_guest_id text default null,
  p_error text default null,
  p_hash text default null,
  p_error_cause jsonb default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row hg_attendances;
begin
  if p_mode not in ('SYNCED', 'REJECTED', 'RETRY', 'BACKOFF', 'MANUAL_RETRY') then
    raise exception 'INVALID_SYNC_MODE';
  end if;

  select * into v_row
  from hg_attendances
  where id = p_id
    and updated_at = p_updated_at
    and transicionais_sync = 'PENDING'
  for update;

  if not found then
    return false;
  end if;

  if p_mode = 'SYNCED' then
    update hg_attendances
      set transicionais_sync = 'SYNCED',
          -- o order_id é unique: se já é de outra linha, fica o que estava
          transicionais_order_id = case
            when p_order_id is null then transicionais_order_id
            when exists (
              select 1 from hg_attendances o where o.transicionais_order_id = p_order_id and o.id <> p_id
            ) then transicionais_order_id
            else p_order_id
          end,
          transicionais_changed_at = case
            when p_changed_at is null then transicionais_changed_at
            else greatest(p_changed_at, coalesce(transicionais_changed_at, p_changed_at))
          end,
          -- o hash da presença no Transicionais (D49): null = não foi lido, fica o que estava
          transicionais_hash = coalesce(p_hash, transicionais_hash),
          error_cause = null,
          sync_error = null,
          attempts = 0
    where id = p_id;

    -- o guest_id é unique: se já é de outra pessoa, não troca
    if p_guest_id is not null then
      update hg_users u
        set transicionais_guest_id = p_guest_id
      where u.id = v_row.user_id
        and u.transicionais_guest_id is distinct from p_guest_id
        and not exists (
          select 1 from hg_users o where o.transicionais_guest_id = p_guest_id and o.id <> v_row.user_id
        );
    end if;

    return true;
  end if;

  if p_mode = 'REJECTED' then
    update hg_attendances
      set transicionais_sync = 'REJECTED',
          sync_error = p_error
    where id = p_id;

    return true;
  end if;

  if p_mode = 'MANUAL_RETRY' then
    update hg_attendances
      set transicionais_sync = 'MANUAL_RETRY',
          error_cause = p_error_cause,
          attempts = attempts + 1
    where id = p_id;

    return true;
  end if;

  if p_mode = 'RETRY' then
    update hg_attendances
      set next_attempt_at = now(),
          error_cause = coalesce(p_error_cause, error_cause)
    where id = p_id;

    return true;
  end if;

  -- BACKOFF: conta a tentativa e volta na próxima chamada do cron (quem chama decide o ritmo, D46)
  update hg_attendances
    set attempts = attempts + 1,
        next_attempt_at = now(),
        error_cause = coalesce(p_error_cause, error_cause)
  where id = p_id;

  return true;
end;
$$;

revoke execute on function marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- marcar_erro_retrato: a leitura do encontro falhou com resposta do Transicionais (D50). Grava o erro
-- como veio e, com p_manual_retry (400, 409 ou 422), o sync_status MANUAL_RETRY. Ajuste manual:
-- voltar sync_status a null.
-- ---------------------------------------------------------------------------

create or replace function marcar_erro_retrato(p_manual_retry boolean, p_error_cause jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update hg_current_event
    set error_cause = p_error_cause,
        sync_status = case when p_manual_retry then 'MANUAL_RETRY' else sync_status end
  where id = 1;
end;
$$;

revoke execute on function marcar_erro_retrato(boolean, jsonb) from public, anon, authenticated;
grant execute on function marcar_erro_retrato(boolean, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- reservar (revista, D50): igual à 0003, mas a linha MANUAL_RETRY ainda não está no Transicionais e
-- conta além do taken, como a PENDING. Sem isso, o estoque perderia as reservas em ajuste manual.
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
  v_group jsonb;
  v_support_ids jsonb := coalesce(p_data -> 'supportIds', '[]'::jsonb);
  v_support_id text;
  v_support jsonb;
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

  -- 4. grupo existe e está ativo (sem groupId é só presença)
  if v_group_id is not null then
    select g.value into v_group
    from jsonb_array_elements(v_data -> 'groups') as g(value)
    where g.value ->> 'id' = v_group_id;

    if v_group is null or coalesce((v_group ->> 'active')::boolean, false) is not true then
      raise exception 'INVALID_GROUP';
    end if;
  end if;

  -- 5. supports: lista de ids, cada um existe no retrato e vale para o grupo.
  --    Sem grupo (só presença) não tem support.
  if jsonb_typeof(v_support_ids) <> 'array' then
    raise exception 'INVALID_SUPPORT';
  end if;

  if v_group_id is null and jsonb_array_length(v_support_ids) > 0 then
    raise exception 'INVALID_SUPPORT';
  end if;

  for v_support_id in select distinct s from jsonb_array_elements_text(v_support_ids) as t(s)
  loop
    select s.value into v_support
    from jsonb_array_elements(v_data -> 'supports') as s(value)
    where s.value ->> 'id' = v_support_id;

    if v_support is null then
      raise exception 'INVALID_SUPPORT';
    end if;

    -- groupIds ausente ou vazio vale para todos os grupos
    if jsonb_array_length(coalesce(v_support -> 'groupIds', '[]'::jsonb)) > 0
      and not (v_support -> 'groupIds') ? v_group_id
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
    and coalesce((v_group ->> 'rotativo')::boolean, false) is not true
    and (v_group ->> 'stockTotal') is not null
  then
    if v_event.external_id is not null then
      select coalesce((v_group ->> 'taken')::integer, 0) + count(*) into v_taken
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

    if v_taken >= (v_group ->> 'stockTotal')::integer then
      raise exception 'SOLD_OUT';
    end if;
  end if;

  -- 8. estoque dos acessórios: mesma conta, por support
  for v_support_id in select distinct s from jsonb_array_elements_text(v_support_ids) as t(s)
  loop
    select s.value into v_support
    from jsonb_array_elements(v_data -> 'supports') as s(value)
    where s.value ->> 'id' = v_support_id;

    if coalesce((v_support ->> 'rotativo')::boolean, false) is true
      or (v_support ->> 'stockTotal') is null
    then
      continue;
    end if;

    if v_event.external_id is not null then
      select coalesce((v_support ->> 'taken')::integer, 0) + count(*) into v_taken
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

    if v_taken >= (v_support ->> 'stockTotal')::integer then
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

revoke execute on function reservar(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function reservar(uuid, text, uuid, jsonb) to service_role;
