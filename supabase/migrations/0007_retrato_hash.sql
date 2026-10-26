-- Retrato pelo hash do Transicionais (D48 de docs/plans/bff-fase-2-duvidas.md).
-- O GET público do encontro traz `hash` (md5) na raiz: muda quando algum campo do encontro muda.
-- A trava do retrato passa a ser o hash, e não a version: o reset do Transicionais recria o encontro
-- com version 0 e o mesmo externalId, e a trava antiga recusava todo retrato novo (D47).

alter table hg_current_event add column if not exists hash text;

drop function if exists gravar_retrato(text, int, timestamptz, jsonb);

-- ---------------------------------------------------------------------------
-- gravar_retrato: grava o retrato do Transicionais com a trava (R13, revista na D48)
--   sem linha: cria;
--   outro external_id: troca a linha inteira;
--   com hash: troca se o hash mudou e a leitura é mais nova (p_vacancies_at > vacancies_at), para
--     uma leitura atrasada não sobrescrever uma mais nova;
--   sem hash (retrato do webhook, em rascunho): a regra antiga, pela version;
--   sem mudança: só marca fetched_at.
-- O whatsappUrl é do Hormônios: fica o que já estava gravado.
-- Devolve true quando trocou o retrato.
-- ---------------------------------------------------------------------------

create or replace function gravar_retrato(
  p_external_id text,
  p_version int,
  p_hash text,
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
    insert into hg_current_event (id, data, external_id, version, hash, vacancies_at, fetched_at)
    values (1, p_data || jsonb_build_object('whatsappUrl', ''), p_external_id, p_version, p_hash, p_vacancies_at, now());

    return true;
  end if;

  v_data := p_data || jsonb_build_object('whatsappUrl', coalesce(v_row.data ->> 'whatsappUrl', ''));

  if v_row.external_id is distinct from p_external_id
    or (
      p_hash is not null
      and p_hash is distinct from v_row.hash
      and p_vacancies_at > coalesce(v_row.vacancies_at, '-infinity'::timestamptz)
    )
    or (
      p_hash is null
      and (
        v_row.version is null
        or p_version > v_row.version
        or (
          p_version = v_row.version
          and p_vacancies_at > coalesce(v_row.vacancies_at, '-infinity'::timestamptz)
          and v_row.data is distinct from v_data
        )
      )
    )
  then
    update hg_current_event
      set data = v_data,
          external_id = p_external_id,
          version = p_version,
          hash = p_hash,
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

revoke execute on function gravar_retrato(text, int, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function gravar_retrato(text, int, text, timestamptz, jsonb) to service_role;
