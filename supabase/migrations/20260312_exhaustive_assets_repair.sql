-- Exhaustive Assets Schema and Permission Repair
-- This script ensures ALL columns and permissions are perfectly aligned.

-- 1) Add every required column if missing
alter table public.assets
  add column if not exists type text,
  add column if not exists content text,
  add column if not exists tags text[] default '{}',
  add column if not exists publication_id uuid references public.publications(id) on delete set null,
  add column if not exists title text,
  add column if not exists source_platform text,
  add column if not exists source_url text;

-- 2) Re-recreate the type check constraint
alter table public.assets drop constraint if exists assets_type_check;
alter table public.assets
  add constraint assets_type_check
  check (type in ('prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment'));

-- 3) Grant full privileges to all roles
GRANT ALL PRIVILEGES ON TABLE public.log_entries TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.assets TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.entities TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON TABLE public.entity_mentions TO anon, authenticated, service_role;

-- 4) Force reload the PostgREST schema cache
NOTIFY pgrst, 'reload schema';
