-- Fase 1 do bff-hormonios: BFF + Supabase, sem login.
-- Plano: docs/plans/bff-fase-1.md e docs/plans/bff-fase-1-implementacao.md (Passo 2).

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table hg_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,               -- minúsculas, sem espaços (R15)
  name text not null,
  pronoun text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table hg_current_event (
  id smallint primary key check (id = 1),   -- uma linha só
  data jsonb not null,                      -- { dayKey, date, time, location, bookingOpen, whatsappUrl,
                                            --   groups: [{ id, name, stockTotal, active }],
                                            --   supports: [{ id, name }] }
  updated_at timestamptz not null default now()
);

create table hg_attendances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references hg_users(id),
  day_key text not null,                    -- fase 1: dayKey local do ensaio; fase 2: configDayId
  device_id uuid not null,                  -- E1.2
  data jsonb not null,                      -- { answer, groupId, supportIds }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day_key)
);

create index hg_attendances_day_device_idx on hg_attendances (day_key, device_id);

-- ---------------------------------------------------------------------------
-- RLS ligada e sem política: só a service_role (BFF) acessa (R10)
-- ---------------------------------------------------------------------------

alter table hg_users enable row level security;
alter table hg_current_event enable row level security;
alter table hg_attendances enable row level security;

-- ---------------------------------------------------------------------------
-- Seed do ensaio atual (o seedInstruments do app.js)
-- ---------------------------------------------------------------------------

insert into hg_current_event (id, data) values (
  1,
  jsonb_build_object(
    'dayKey', gen_random_uuid()::text,
    'date', '',
    'time', '',
    'location', 'A definir',
    'bookingOpen', true,
    'whatsappUrl', '',
    'groups', jsonb_build_array(
      jsonb_build_object('id', 'caixa',     'name', 'Caixa',            'stockTotal', 6, 'active', true),
      jsonb_build_object('id', 'tamborim',  'name', 'Tamborim',         'stockTotal', 6, 'active', true),
      jsonb_build_object('id', 'surdo-1',   'name', 'Surdo de 1ª',      'stockTotal', 2, 'active', true),
      jsonb_build_object('id', 'surdo-2',   'name', 'Surdo de 2ª',      'stockTotal', 2, 'active', true),
      jsonb_build_object('id', 'surdo-3',   'name', 'Surdo de 3ª',      'stockTotal', 2, 'active', true),
      jsonb_build_object('id', 'agogo',     'name', 'Agogô',            'stockTotal', 4, 'active', true),
      jsonb_build_object('id', 'repinique', 'name', 'Repinique',        'stockTotal', 3, 'active', true),
      jsonb_build_object('id', 'timbal',    'name', 'Timbal',           'stockTotal', 2, 'active', true),
      jsonb_build_object('id', 'alfaia',    'name', 'Alfaia',           'stockTotal', 2, 'active', true),
      jsonb_build_object('id', 'ganza',     'name', 'Ganzá (Chocalho)', 'stockTotal', 5, 'active', true)
    ),
    'supports', jsonb_build_array(
      jsonb_build_object('id', 'talabarte', 'name', 'Talabarte'),
      jsonb_build_object('id', 'baqueta',   'name', 'Baqueta / maçaneta')
    )
  )
);

-- ---------------------------------------------------------------------------
-- reservar: conta as vagas e grava numa chamada só, com trava na linha do ensaio (E1.6)
-- Erros de negócio: raise exception '<CODIGO>' (o repo traduz em AppError)
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
  v_event jsonb;
  v_group_id text := p_data ->> 'groupId';
  v_group jsonb;
  v_existing hg_attendances;
  v_taken integer;
  v_result hg_attendances;
begin
  -- 1. trava a linha do ensaio: pedidos ao mesmo tempo esperam um pelo outro
  select data into v_event from hg_current_event where id = 1 for update;

  if v_event is null then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  -- 2. reservas fechadas
  if coalesce((v_event ->> 'bookingOpen')::boolean, false) is not true then
    raise exception 'BOOKING_CLOSED';
  end if;

  -- 3. o ensaio mudou desde que a pessoa abriu a folha
  if (v_event ->> 'dayKey') is distinct from p_day_key then
    raise exception 'EVENT_CHANGED';
  end if;

  -- 4. grupo existe e está ativo (sem groupId é só presença)
  if v_group_id is not null then
    select g.value into v_group
    from jsonb_array_elements(v_event -> 'groups') as g(value)
    where g.value ->> 'id' = v_group_id;

    if v_group is null or coalesce((v_group ->> 'active')::boolean, false) is not true then
      raise exception 'INVALID_GROUP';
    end if;
  end if;

  -- 5. uma reserva "vou" por e-mail no dia (E1.3), exceto presença deste aparelho ganhando instrumento
  select * into v_existing
  from hg_attendances
  where user_id = p_user_id and day_key = p_day_key;

  if found and v_existing.data ->> 'answer' = 'vou' then
    if not (
      v_existing.device_id = p_device_id
      and v_existing.data ->> 'groupId' is null
      and v_group_id is not null
    ) then
      raise exception 'ALREADY_RESERVED';
    end if;
  end if;

  -- 6. estoque: conta só as reservas "vou" deste grupo
  if v_group_id is not null then
    select count(*) into v_taken
    from hg_attendances
    where day_key = p_day_key
      and data ->> 'answer' = 'vou'
      and data ->> 'groupId' = v_group_id;

    if v_taken >= coalesce((v_group ->> 'stockTotal')::integer, 0) then
      raise exception 'SOLD_OUT';
    end if;
  end if;

  -- 7. grava; o on conflict permite reservar de novo depois de "Não vou"
  insert into hg_attendances (user_id, day_key, device_id, data)
  values (p_user_id, p_day_key, p_device_id, p_data || jsonb_build_object('answer', 'vou'))
  on conflict (user_id, day_key) do update
    set data = excluded.data,
        device_id = excluded.device_id,
        updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

revoke execute on function reservar(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function reservar(uuid, text, uuid, jsonb) to service_role;
