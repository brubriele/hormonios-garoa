-- claim_pending de todos os dias do Transicionais (revê a D11; D45 de docs/plans/bff-fase-2-duvidas.md).
-- O cron de sync envia as linhas PENDING de qualquer dia do Transicionais, e não só do encontro atual
-- (ex.: um "Não vou" de um ensaio que já passou). O day_key do Transicionais é o configDayId, numérico;
-- as linhas de ensaios antigos da fase 1 (day_key = UUID local) continuam de fora, porque o dia delas
-- não existe no Transicionais.

drop function if exists claim_pending(text, int);

-- ---------------------------------------------------------------------------
-- claim_pending: pega até p_limit linhas PENDING de dia do Transicionais com next_attempt_at vencido
-- e adia o next_attempt_at delas em 2 min. for update skip locked: duas execuções nunca pegam a
-- mesma linha. Devolve as linhas (o repo embute o hg_users pelo PostgREST).
-- ---------------------------------------------------------------------------

create or replace function claim_pending(p_limit int)
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
      and a.day_key ~ '^[0-9]+$'
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

revoke execute on function claim_pending(int) from public, anon, authenticated;
grant execute on function claim_pending(int) to service_role;
