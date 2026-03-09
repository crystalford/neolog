-- Assets: the personal inventory / "garage"
-- Each asset is an owned item (car, laptop, camera, property, etc.)
-- Log entries can link to assets to build a maintenance/update history.

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  name text not null,               -- "2014 Camry LE"
  category text not null default 'other' check (category in (
    'vehicle', 'hardware', 'software', 'property', 'gear', 'instrument',
    'health', 'subscription', 'other'
  )),

  -- Value tracking
  purchase_price numeric,
  current_value numeric,
  acquired_at date,

  -- Description / notes
  description text,

  -- Cover image
  image_url text,

  -- Privacy
  is_public boolean not null default true,

  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Extensible metadata
  meta jsonb not null default '{}'  -- brand, model, year, serial, condition, etc.
);

create index if not exists idx_assets_user_id on public.assets(user_id);
create index if not exists idx_assets_user_category on public.assets(user_id, category);

-- RLS
alter table public.assets enable row level security;

create policy "Public assets are readable by anyone"
  on public.assets for select
  using (is_public = true);

create policy "Users can view all own assets"
  on public.assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own assets"
  on public.assets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own assets"
  on public.assets for update
  using (auth.uid() = user_id);

create policy "Users can delete own assets"
  on public.assets for delete
  using (auth.uid() = user_id);

create policy "Service role full access to assets"
  on public.assets for all
  using (auth.role() = 'service_role');

-- Auto-update updated_at
create trigger assets_updated_at
  before update on public.assets
  for each row execute function public.handle_updated_at();
