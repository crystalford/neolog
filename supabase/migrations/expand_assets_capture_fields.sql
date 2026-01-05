-- Expand Asset Vault to support Capture-First provenance fields

-- 1) Add provenance columns (safe to run multiple times)
alter table public.assets
  add column if not exists title text,
  add column if not exists source_platform text,
  add column if not exists source_url text;

-- 2) Expand allowed asset types
-- Default Postgres check constraint name for `type` is typically `assets_type_check`
alter table public.assets drop constraint if exists assets_type_check;

alter table public.assets
  add constraint assets_type_check
  check (type in ('prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment'));

-- 3) Helpful indexes
create index if not exists assets_source_platform_idx on public.assets(source_platform);
create index if not exists assets_source_url_idx on public.assets(source_url);
