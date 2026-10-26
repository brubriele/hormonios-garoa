-- Sync sem espera crescente (D46 de docs/plans/bff-fase-2-duvidas.md): quem chama o cron decide o
-- ritmo. A linha que falhou volta na próxima chamada.

-- ---------------------------------------------------------------------------
-- marcar_sync (revista, D46): igual à 0004, menos o BACKOFF. Antes, a espera era 1, 2, 4… até 30 min
-- e o cron não pegava a linha até ela vencer. Agora quem chama o cron decide o ritmo: a falha só
-- soma attempts e libera a linha (next_attempt_at = now()). A trava de 2 min do claim_pending
-- continua, e só segura a linha enquanto o envio está em andamento.
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

  -- BACKOFF: conta a tentativa e volta na próxima chamada do cron (quem chama decide o ritmo, D46)
  update hg_attendances
    set attempts = attempts + 1,
        next_attempt_at = now()
  where id = p_id;

  return true;
end;
$$;

revoke execute on function marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function marcar_sync(uuid, timestamptz, text, text, timestamptz, text, text) to service_role;

-- as linhas que ficaram esperando pela regra antiga voltam na próxima chamada do cron
update hg_attendances
  set next_attempt_at = now()
where transicionais_sync = 'PENDING'
  and next_attempt_at > now();
