-- Fase 2 do bff-hormonios: integração com o Transicionais e plano de falha.
-- Plano: docs/plans/bff-fase-2.md e docs/plans/bff-fase-2-implementacao.md (Passo A).

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------

alter table hg_current_event
  add column external_id text,              -- public.id do encontro atual no Transicionais (trava); null = retrato local da fase 1
  add column version int,                   -- EventFull.version do Transicionais
  add column vacancies_at timestamptz,      -- quando as vagas do retrato foram calculadas
  add column fetched_at timestamptz;        -- última leitura do Transicionais

-- data do retrato do Transicionais: o mesmo jsonb da fase 1, e cada grupo ganha
-- taken (ocupado no Transicionais = total - free). Sem external_id, não há taken.

alter table hg_users
  add column transicionais_guest_id text unique;   -- devolvido pelo envio da reserva

alter table hg_attendances
  add column transicionais_sync text not null default 'PENDING'
    check (transicionais_sync in ('PENDING','SYNCED','REJECTED')),
  add column transicionais_order_id text unique,
  add column transicionais_changed_at timestamptz,
  add column sync_error text,
  add column attempts int not null default 0,
  add column next_attempt_at timestamptz not null default now();

create index hg_attendances_sync_idx on hg_attendances (transicionais_sync, next_attempt_at);

create table hg_webhook_deliveries (
  delivery_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- RLS ligada e sem política: só a service_role (BFF) acessa (R10)
alter table hg_webhook_deliveries enable row level security;

-- ---------------------------------------------------------------------------
-- gravar_retrato: grava o retrato do Transicionais com a trava (R13)
--   outro external_id (ou retrato sem versão): troca a linha inteira;
--   mesmo external_id: troca se a versão for maior, ou igual com vagas mais novas e retrato diferente;
--   sem mudança: só marca fetched_at.
-- O whatsappUrl é do Hormônios: fica o que já estava gravado.
-- Devolve true quando trocou o retrato.
-- ---------------------------------------------------------------------------

create or replace function gravar_retrato(
  p_external_id text,
  p_version int,
  p_vacancies_at timestamptz,
  p_data jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row hg_current_event;
  v_data jsonb;
begin
  select * into v_row from hg_current_event where id = 1 for update;

  if not found then
    insert into hg_current_event (id, data, external_id, version, vacancies_at, fetched_at)
    values (1, p_data || jsonb_build_object('whatsappUrl', ''), p_external_id, p_version, p_vacancies_at, now());

    return true;
  end if;

  v_data := p_data || jsonb_build_object('whatsappUrl', coalesce(v_row.data ->> 'whatsappUrl', ''));

  if v_row.external_id is distinct from p_external_id
    or v_row.version is null
    or p_version > v_row.version
    or (
      p_version = v_row.version
      and p_vacancies_at > coalesce(v_row.vacancies_at, '-infinity'::timestamptz)
      and v_row.data is distinct from v_data
    )
  then
    update hg_current_event
      set data = v_data,
          external_id = p_external_id,
          version = p_version,
          vacancies_at = p_vacancies_at,
          fetched_at = now(),
          updated_at = now()
    where id = 1;

    return true;
  end if;

  update hg_current_event set fetched_at = now() where id = 1;

  return false;
end;
$$;

revoke execute on function gravar_retrato(text, int, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function gravar_retrato(text, int, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- gravar_whatsapp: o link do WhatsApp é só do Hormônios (não vai ao Transicionais)
-- ---------------------------------------------------------------------------

create or replace function gravar_whatsapp(p_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update hg_current_event
    set data = data || jsonb_build_object('whatsappUrl', p_url),
        updated_at = now()
  where id = 1;

  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
end;
$$;

revoke execute on function gravar_whatsapp(text) from public, anon, authenticated;
grant execute on function gravar_whatsapp(text) to service_role;

-- ---------------------------------------------------------------------------
-- migrar_fase1: leva as linhas de um dia para outro (E2.2) e marca PENDING, para o cron enviar.
--   p_group_map: { "<groupId antigo>": "<groupId novo>" }. Grupo fora do mapa vira só presença.
--   Também serve para a troca de data do encontro (o dia muda no Transicionais).
-- A pessoa que já tem linha no dia novo fica com a do dia novo (unique user_id, day_key).
-- Devolve quantas linhas mudaram.
-- ---------------------------------------------------------------------------

create or replace function migrar_fase1(
  p_old_day_key text,
  p_new_day_key text,
  p_group_map jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_old_day_key = p_new_day_key then
    return 0;
  end if;

  update hg_attendances a
    set day_key = p_new_day_key,
        data = case
          when a.data ->> 'groupId' is null then a.data
          when p_group_map ? (a.data ->> 'groupId')
            then jsonb_set(a.data, '{groupId}', p_group_map -> (a.data ->> 'groupId'))
          else a.data || jsonb_build_object('groupId', null, 'supportIds', '[]'::jsonb)
        end,
        transicionais_sync = 'PENDING',
        sync_error = null,
        attempts = 0,
        next_attempt_at = now(),
        updated_at = now()
  where a.day_key = p_old_day_key
    and not exists (
      select 1 from hg_attendances b
      where b.user_id = a.user_id and b.day_key = p_new_day_key
    );

  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

revoke execute on function migrar_fase1(text, text, jsonb) from public, anon, authenticated;
grant execute on function migrar_fase1(text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- reservar (revista): REJECTED conta como "nao-vou", e a conta de vagas usa o retrato.
--   Retrato do Transicionais (external_id): taken do grupo + linhas "vou" locais PENDING do grupo.
--   Retrato local da fase 1 (sem external_id): linhas "vou" do grupo, menos as REJECTED.
-- A linha gravada volta a PENDING, para o envio (onda 3).
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

  -- 5. uma reserva "vou" por e-mail no dia (E1.3), exceto presença deste aparelho ganhando
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

  -- 6. estoque
  if v_group_id is not null then
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

    if v_taken >= coalesce((v_group ->> 'stockTotal')::integer, 0) then
      raise exception 'SOLD_OUT';
    end if;
  end if;

  -- 7. grava; o on conflict permite reservar de novo depois de "Não vou" ou de uma recusa
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
