-- a fila de integração (src/serve-utils/domain/IntegrationStatus.ts): uma linha por entidade enviada ao Transicionais
create table integration_status (
  id uuid primary key default gen_random_uuid(),
  entity text not null,                     -- EVENT | USER | ATTENDANCE
  "entityId" uuid not null,
  status text not null,                     -- SyncStatus
  "syncAt" timestamptz not null,            -- a última tentativa
  tentatives int not null default 0,
  "nextSyncAt" timestamptz,                 -- null = não espera
  "errorCtx" jsonb,                         -- o erro do Transicionais como veio
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity, "entityId")
);

-- só o BFF acessa, com a service_role (R10)
alter table integration_status enable row level security;
