-- RUN THIS IN SUPABASE SQL EDITOR TO FIX SETTINGS PAGE ERRORS
-- This script ensures ALL necessary tables and columns exist for the NEW Neolog vision.

-- 1. Integration Keys (BYOK - Main App)
create table if not exists public.integration_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null,
  label text,
  is_active boolean default true,
  quota_limit_usd numeric(10,2),
  encrypted_key text not null,
  iv text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint unique_integration_key unique (user_id, provider, label)
);

-- Ensure columns exist if table was already created without them
alter table public.integration_keys add column if not exists is_active boolean default true;
alter table public.integration_keys add column if not exists quota_limit_usd numeric(10,2);
alter table public.integration_keys add column if not exists label text;

create index if not exists integration_keys_user_idx on public.integration_keys(user_id);
create index if not exists integration_keys_provider_idx on public.integration_keys(provider);
create index if not exists integration_keys_active_idx on public.integration_keys(user_id, provider) where is_active = true;

alter table public.integration_keys enable row level security;

do $$ begin
  create policy "Users manage their own integration keys"
    on public.integration_keys for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when others then null; end $$;

-- 2. Usage Caps
create table if not exists public.provider_usage_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  period text not null check (period in ('day', 'month')),
  token_limit int not null check (token_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, period)
);

alter table public.provider_usage_limits enable row level security;

do $$ begin
  create policy "Users manage own usage limits"
    on public.provider_usage_limits for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when others then null; end $$;

-- 3. Storage Connections
create table if not exists public.storage_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null check (provider in ('r2', 's3')),
  access_key_id text not null,
  bucket text not null,
  region text,
  endpoint text,
  public_base_url text,
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_storage_connection unique (user_id, provider)
);

alter table public.storage_connections enable row level security;

do $$ begin
  create policy "Users manage own storage"
    on public.storage_connections for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when others then null; end $$;

-- 4. Automation API Keys (for n8n/external tools)
create table if not exists public.api_keys (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  label text,
  key_hash text not null,
  last_used_at timestamptz,
  created_at timestamptz default now()
);

alter table public.api_keys enable row level security;

do $$ begin
  create policy "Users manage own api keys"
    on public.api_keys for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
exception when others then null; end $$;


-- 5. PERMISSIONS FIX
-- Ensure the schema is accessible
grant usage on schema public to postgres, anon, authenticated, service_role;

-- Grant access to all settings tables
grant all on table public.integration_keys to postgres, authenticated, service_role;
grant all on table public.provider_usage_limits to postgres, authenticated, service_role;
grant all on table public.storage_connections to postgres, authenticated, service_role;
grant all on table public.api_keys to postgres, authenticated, service_role;

-- Optional: Grant read to anon if any public viewing is needed (unlikely for these)
grant select on table public.integration_keys to anon;
grant select on table public.provider_usage_limits to anon;
grant select on table public.storage_connections to anon;
grant select on table public.api_keys to anon;
