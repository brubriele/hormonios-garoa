-- Estoque das assistências (E2.9 de docs/plans/bff-fase-2.md).
-- O estoque é o capacity do support type do Transicionais, não a vaga do grupo.
--
-- O jsonb do retrato (hg_current_event.data) passa a ter:
--   groups[]   { id, name, stockTotal (null = sem limite), active, taken, rotativo, instrumentSupportId }
--   supports[] { id, name, stockTotal (null = sem limite), taken, rotativo, groupIds (array de string) }
-- Retrato local da fase 1 (sem external_id e sem os campos novos): support sem limite,
-- não rotativo e com groupIds vazio (vale para todos os grupos).

-- ---------------------------------------------------------------------------
-- reservar (revista de novo):
--   grupo rotativo ou com stockTotal null não bloqueia;
--   cada supportId precisa existir no retrato e valer para o grupo (groupIds vazio ou com o grupo),
--     senão INVALID_SUPPORT;
--   support não rotativo e com stockTotal: taken + linhas "vou" PENDING do dia com o support
--     (fase 1: linhas "vou" não REJECTED) >= stockTotal dá ACCESSORY_SOLD_OUT.
-- O resto é o da 0002.
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
        and transicionais_sync = 'PENDING';
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
        and transicionais_sync = 'PENDING';
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
