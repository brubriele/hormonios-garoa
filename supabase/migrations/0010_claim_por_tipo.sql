-- O cron de sincronização envia por contexto (próximo ensaio, estoque, reservas): cada usecase pega só
-- o seu tipo da fila da Produção. Troca o claim_escritas(p_limit) da 0009 pelo claim_escritas(p_kind,
-- p_limit), com o mesmo for update skip locked e o mesmo adiamento de 2 min.

drop function if exists claim_escritas(int);

create or replace function claim_escritas(p_kind text, p_limit int)
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
    where w.kind = p_kind
      and w.status = 'PENDING'
      and w.next_attempt_at <= now()
    order by w.created_at, w.id
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

revoke execute on function claim_escritas(text, int) from public, anon, authenticated;
grant execute on function claim_escritas(text, int) to service_role;
