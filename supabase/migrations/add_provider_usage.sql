-- Provider usage tracking (tokens per AI call)

create table if not exists public.provider_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  model text,
  route text,
  operation text,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_provider_usage_user_created_at
  on public.provider_usage(user_id, created_at desc);

create index if not exists idx_provider_usage_provider_created_at
  on public.provider_usage(provider, created_at desc);

alter table public.provider_usage enable row level security;

drop policy if exists "select_own_usage" on public.provider_usage;
create policy "select_own_usage"
  on public.provider_usage
  for select
  using (auth.uid() = user_id);

grant select on table public.provider_usage to authenticated;
grant select, insert, update, delete on table public.provider_usage to service_role;
