-- Adds a provenance-first Asset Vault (V1 primitive)

create table if not exists public.assets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  type text not null check (type in ('prompt', 'image', 'code', 'text', 'link')),
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists assets_user_idx on public.assets(user_id);
create index if not exists assets_type_idx on public.assets(type);
create index if not exists assets_tags_gin on public.assets using gin(tags);

alter table public.assets enable row level security;

-- Users can fully manage their own assets
create policy "Users manage own assets"
  on public.assets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
