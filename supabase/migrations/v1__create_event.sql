-- o Evento (src/serve-utils/domain/event.ts): só os ids ficam em coluna; o resto do contrato fica em data
create table event (
  id uuid primary key default gen_random_uuid(),
  "integrationId" bigint,                  -- id interno do encontro no Transicionais; null = ainda não integrado
  "transicionaisDayId" bigint,             -- o dia do encontro no Transicionais (configDayId); null = ainda não integrado
  "syncHash" char(32),                     -- md5 do encontro no Transicionais
  "syncedAt" timestamp,
  data jsonb not null,                      -- todo o resto do Event
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- só o BFF acessa, com a service_role (R10)
alter table event enable row level security;

-- a pessoa (src/serve-utils/domain/user.ts): o email fica em coluna, único (acha e liga a pessoa ao
-- Transicionais); o resto do contrato fica em data. "user" é palavra reservada: sempre entre aspas
create table "user" (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  data jsonb not null,                      -- todo o resto do User
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- só o BFF acessa, com a service_role (R10)
alter table "user" enable row level security;

-- a Presença (src/serve-utils/domain/attendance.ts): só os ids ficam em coluna; o resto do contrato fica em data
create table attendance (
  id uuid primary key default gen_random_uuid(),
  "eventId" uuid not null references event(id),
  "userId" uuid not null references "user"(id),
  "syncHash" char(32),                     -- md5 da presença no Transicionais
  "syncedAt" timestamp,
  data jsonb not null,                      -- todo o resto da Attendance
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- só o BFF acessa, com a service_role (R10)
alter table attendance enable row level security;
