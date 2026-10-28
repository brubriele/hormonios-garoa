-- as chaves do sistema, uma linha por chave (K1). 'integration' = IntegrationSetting
-- (src/serve-utils/domain/IntegrationSetting.ts): { transicionaisEnabled, updatedAt }; sem linha = ligado
create table setting (
  id text primary key,                      -- integration
  data jsonb not null,                      -- o valor da chave
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- só o BFF acessa, com a service_role (R10)
alter table setting enable row level security;
