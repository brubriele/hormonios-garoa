-- o estado do ensaio: qual é o atual, qual é o próximo e se as reservas estão abertas (spec-8 A)
create table current_event (
  id uuid primary key default gen_random_uuid(),
  "eventId" uuid not null unique references event(id),
  "isActive" boolean not null default false,   -- reservas abertas (spec-8 C1)
  "isCurrent" boolean not null default false,  -- o ensaio atual
  "nextEventId" uuid references event(id),     -- null = fim da lista
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- no máximo um aberto e um atual (spec-8 A2)
create unique index current_event_active on current_event ("isActive") where "isActive";
create unique index current_event_current on current_event ("isCurrent") where "isCurrent";

-- só o BFF acessa, com a service_role (R10)
alter table current_event enable row level security;

-- toda atualização passa por aqui, com a linha atual travada (spec-8 B1); null = não enviou
-- "isCurrent" true é a troca (B3): o atual de antes perde isActive e isCurrent
-- os parâmetros têm o nome das colunas: update_current_event."<nome>" é o parâmetro, "<nome>" é a coluna
create function update_current_event("eventId" uuid, "isActive" boolean, "isCurrent" boolean, "nextEventId" uuid)
returns current_event
language plpgsql as $$
#variable_conflict use_column
declare
  updated current_event;
begin
  perform 1 from current_event where "isCurrent" for update;

  if update_current_event."isCurrent" then
    update current_event
       set "isActive" = false, "isCurrent" = false, updated_at = now()
     where "isCurrent" and "eventId" <> update_current_event."eventId";
  end if;

  update current_event
     set "isActive" = coalesce(update_current_event."isActive", "isActive"),
         "isCurrent" = coalesce(update_current_event."isCurrent", "isCurrent"),
         "nextEventId" = coalesce(update_current_event."nextEventId", "nextEventId"),
         updated_at = now()
   where "eventId" = update_current_event."eventId"
  returning * into updated;

  if not found then
    raise exception 'CURRENT_EVENT_NOT_FOUND';
  end if;

  return updated;
end $$;
