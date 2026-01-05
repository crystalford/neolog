-- Usage caps (optional) for AI token spend

create table if not exists public.provider_usage_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  period text not null check (period in ('day', 'month')),
  token_limit int not null check (token_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider, period)
);

-- keep updated_at fresh
create or replace function public.provider_usage_limits_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists provider_usage_limits_updated_at on public.provider_usage_limits;
create trigger provider_usage_limits_updated_at
  before update on public.provider_usage_limits
  for each row
  execute function public.provider_usage_limits_touch_updated_at();

alter table public.provider_usage_limits enable row level security;

drop policy if exists "select_own_usage_limits" on public.provider_usage_limits;
create policy "select_own_usage_limits"
  on public.provider_usage_limits
  for select
  using (auth.uid() = user_id);

drop policy if exists "upsert_own_usage_limits" on public.provider_usage_limits;
create policy "upsert_own_usage_limits"
  on public.provider_usage_limits
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "update_own_usage_limits" on public.provider_usage_limits;
create policy "update_own_usage_limits"
  on public.provider_usage_limits
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete_own_usage_limits" on public.provider_usage_limits;
create policy "delete_own_usage_limits"
  on public.provider_usage_limits
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on table public.provider_usage_limits to authenticated;
grant select, insert, update, delete on table public.provider_usage_limits to service_role;

-- Fast total tokens since timestamp; respects ownership and supports service_role.
create or replace function public.sum_provider_usage(
  p_user_id uuid,
  p_provider text,
  p_since timestamptz
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(total_tokens), 0)::bigint
  from public.provider_usage
  where user_id = p_user_id
    and provider = p_provider
    and created_at >= p_since
    and (auth.uid() = p_user_id or auth.role() = 'service_role');
$$;

grant execute on function public.sum_provider_usage(uuid, text, timestamptz) to authenticated;
grant execute on function public.sum_provider_usage(uuid, text, timestamptz) to service_role;
