-- Sincronização das reservas com o Transicionais (onda 3, Passo B de docs/plans/bff-fase-2-implementacao.md).
-- Plano: seções "Escrita da reserva", "Cron de sincronização" e "Webhooks" de docs/plans/bff-fase-2.md.
--
-- Nenhuma destas funções mexe em hg_attendances.updated_at: ele marca a última mudança LOCAL da
-- linha. É a trava do envio (o envio só vale se o updated_at é o lido antes) e entra na
-- idempotencyKey (<id>:<updated_at>), que precisa ser a mesma nos reenvios do mesmo estado.

-- ---------------------------------------------------------------------------
-- claim_pending: pega até p_limit linhas PENDING do dia atual com next_attempt_at vencido e adia
-- o next_attempt_at delas em 2 min. for update skip locked: duas execuções nunca pegam a mesma
-- linha. Só o p_day_key (D11): as linhas de ensaios antigos da fase 1 (day_key = UUID local)
-- nunca são enviadas. Devolve as linhas (o repo embute o hg_users pelo PostgREST).
-- ---------------------------------------------------------------------------

create or replace function claim_pending(p_day_key text, p_limit int)
returns setof hg_attendances
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select a.id
    from hg_attendances a
    where a.transicionais_sync = 'PENDING'
      and a.day_key = p_day_key
      and a.next_attempt_at <= now()
    order by a.next_attempt_at, a.id
    limit greatest(coalesce(p_limit, 0), 0)
    for update skip locked
  )
  update hg_attendances a
    set next_attempt_at = now() + interval '2 minutes'
  from picked
  where a.id = picked.id
  returning a.*;
end;
$$;

revoke execute on function claim_pending(text, int) from public, anon, authenticated;
grant execute on function claim_pending(text, int) to service_role;

-- ---------------------------------------------------------------------------
-- marcar_sync: grava o resultado de um envio, só se a linha ainda é a enviada
-- (updated_at = p_updated_at) e continua PENDING. Uma função com modo:
--   SYNCED   -> transicionais_order_id, transicionais_changed_at (o mais novo), attempts = 0,
--               sync_error = null e hg_users.transicionais_guest_id;
--   REJECTED -> sync_error = p_error (key do Hormônios);
--   RETRY    -> continua PENDING e volta no próximo ciclo (VALIDATION_ANSWER_CHANGED);
--   BACKOFF  -> continua PENDING, attempts + 1 e espera 1, 2, 4… min, até 30 min.
-- Devolve true quando gravou. false = a linha mudou durante o envio (o cron envia o estado novo).
-- ---------------------------------------------------------------------------

create or replace function marcar_sync(
  p_id uuid,
  p_updated_at timestamptz,
  p_mode text,
  p_order_id text default null,
  p_changed_at timestamptz default null,
  p_guest_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row hg_attendances;
begin
  if p_mode not in ('SYNCED', 'REJECTED', 'RETRY', 'BACKOFF') then
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

  if p_mode = 'RETRY' then
    update hg_attendances
      set next_attempt_at = now()
    where id = p_id;

    return true;
  end if;

  -- BACKOFF: 2^attempts minutos (1, 2, 4, 8, 16), no máximo 30
  update hg_attendances
    set attempts = attempts + 1,
        next_attempt_at = now() + make_interval(mins => least(30, power(2, least(attempts, 5))::int))
  where id = p_id;

  return true;
end;
$$;

revoke execute on function marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- aplicar_validacao: webhook validation.changed (regras 1 a 4 da seção Webhooks).
--   1. acha a linha pelo transicionais_order_id; senão, a pessoa pelo transicionais_guest_id ou
--      pelo e-mail, e a linha pelo dia;
--   2. trava: só se p_changed_at > transicionais_changed_at;
--   3. linha PENDING com updated_at > p_changed_at: a mudança local é mais nova, fica a local;
--   4. grava data, transicionais_order_id, transicionais_changed_at e SYNCED.
-- p_data já vem no formato do Hormônios ({ answer, groupId, supportIds }).
-- Devolve: APPLIED, STALE, LOCAL_NEWER, UNKNOWN_PERSON (B6) ou NO_ROW (pessoa sem linha no dia).
-- ---------------------------------------------------------------------------

create or replace function aplicar_validacao(
  p_order_id text,
  p_day_key text,
  p_guest_id text,
  p_email text,
  p_data jsonb,
  p_changed_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row hg_attendances;
  v_user_id uuid;
begin
  if p_order_id is not null then
    select * into v_row from hg_attendances where transicionais_order_id = p_order_id for update;
  end if;

  if v_row.id is null then
    select u.id into v_user_id
    from hg_users u
    where (p_guest_id is not null and u.transicionais_guest_id = p_guest_id)
       or (p_email is not null and u.email = lower(regexp_replace(p_email, '\s+', '', 'g')))
    order by (p_guest_id is not null and u.transicionais_guest_id = p_guest_id) desc
    limit 1;

    if v_user_id is null then
      return 'UNKNOWN_PERSON';
    end if;

    select * into v_row
    from hg_attendances
    where user_id = v_user_id and day_key = p_day_key
    for update;

    if v_row.id is null then
      return 'NO_ROW';
    end if;
  end if;

  if v_row.transicionais_changed_at is not null and p_changed_at <= v_row.transicionais_changed_at then
    return 'STALE';
  end if;

  if v_row.transicionais_sync = 'PENDING' and v_row.updated_at > p_changed_at then
    return 'LOCAL_NEWER';
  end if;

  update hg_attendances
    set data = p_data,
        transicionais_order_id = case
          when p_order_id is null then transicionais_order_id
          when exists (
            select 1 from hg_attendances o where o.transicionais_order_id = p_order_id and o.id <> v_row.id
          ) then transicionais_order_id
          else p_order_id
        end,
        transicionais_changed_at = p_changed_at,
        transicionais_sync = 'SYNCED',
        sync_error = null,
        attempts = 0
  where id = v_row.id;

  return 'APPLIED';
end;
$$;

revoke execute on function aplicar_validacao(text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function aplicar_validacao(text, text, text, text, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- gravar_vagas: o ocupado do dia que veio num webhook (regra 6). Troca o taken dos grupos
-- (instrumentos) e dos supports (acessórios) do retrato, só se:
--   o retrato é do Transicionais, o dia é o do retrato e p_vacancies_at > vacancies_at.
-- p_taken: { "groups": { "<groupId>": n }, "supports": { "<supportId>": n } }. Id fora do mapa
-- fica como está. Devolve true quando gravou.
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
  v_groups jsonb := coalesce(p_taken -> 'groups', '{}'::jsonb);
  v_supports jsonb := coalesce(p_taken -> 'supports', '{}'::jsonb);
begin
  update hg_current_event e
    set data = e.data
          || jsonb_build_object(
            'groups',
            coalesce((
              select jsonb_agg(
                case
                  when v_groups ? (g.value ->> 'id')
                    then g.value || jsonb_build_object('taken', greatest(0, (v_groups ->> (g.value ->> 'id'))::int))
                  else g.value
                end
                order by g.ord
              )
              from jsonb_array_elements(e.data -> 'groups') with ordinality as g(value, ord)
            ), '[]'::jsonb),
            'supports',
            coalesce((
              select jsonb_agg(
                case
                  when v_supports ? (s.value ->> 'id')
                    then s.value || jsonb_build_object('taken', greatest(0, (v_supports ->> (s.value ->> 'id'))::int))
                  else s.value
                end
                order by s.ord
              )
              from jsonb_array_elements(e.data -> 'supports') with ordinality as s(value, ord)
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

revoke execute on function gravar_vagas(text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function gravar_vagas(text, timestamptz, jsonb) to service_role;
