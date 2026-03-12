-- Fix assets name column constraint
-- The Capture API uses 'title', so we need to make the legacy 'name' column optional.

alter table public.assets
  alter column name drop not null;

-- Force reloadPostgREST schema cache
NOTIFY pgrst, 'reload schema';
