-- RUN THIS IN SUPABASE SQL EDITOR
-- Aligns integration_keys schema with how the app actually reads/writes keys.

alter table public.integration_keys
  add column if not exists key_value text;

-- Make the encrypted columns optional so plaintext-only inserts work.
alter table public.integration_keys
  alter column encrypted_key drop not null;

alter table public.integration_keys
  alter column iv drop not null;
