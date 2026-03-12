-- Repair Assets table schema and permissions
-- This ensures all columns expected by the Capture API exist and are accessible.

-- 1) Add any missing columns to assets
alter table public.assets
  add column if not exists type text,
  add column if not exists content text,
  add column if not exists tags text[] default '{}',
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

-- 2) Update type check constraint if it exists
alter table public.assets drop constraint if exists assets_type_check;
alter table public.assets
  add constraint assets_type_check
  check (type in ('prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment'));

-- 3) Grant privileges to roles
GRANT ALL PRIVILEGES ON TABLE public.log_entries TO anon;
GRANT ALL PRIVILEGES ON TABLE public.log_entries TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.log_entries TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.assets TO anon;
GRANT ALL PRIVILEGES ON TABLE public.assets TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.assets TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.entities TO anon;
GRANT ALL PRIVILEGES ON TABLE public.entities TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.entities TO service_role;

GRANT ALL PRIVILEGES ON TABLE public.entity_mentions TO anon;
GRANT ALL PRIVILEGES ON TABLE public.entity_mentions TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.entity_mentions TO service_role;
