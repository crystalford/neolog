-- The Log: structured life events that surface on the public feed
-- Every upload, capture, and manual entry eventually creates a log_entry.

create table if not exists public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Type of life event
  entry_type text not null default 'session' check (entry_type in (
    'work', 'food', 'health', 'finance', 'asset_update',
    'social', 'learn', 'build', 'session', 'capture'
  )),

  -- Content
  title text not null,
  body text,                           -- optional expanded note / AI summary
  thumbnail_url text,                  -- image/thumbnail link

  -- The REAL date the event happened (not just when it was uploaded)
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Software / tool tags (rendered as colored chips in the feed)
  software_tags text[] not null default '{}',

  -- Financial metadata
  cost_delta numeric,                  -- negative = spent, positive = earned/saved

  -- Asset link (e.g., "2014 Camry LE")
  asset_id uuid references public.assets(id) on delete set null,

  -- Source tracing back to the raw ingest (no FK until video_uploads is migrated)
  source_upload_id uuid,
  source_capture_id uuid,             -- future: references captures(id)

  -- Privacy
  is_public boolean not null default true,

  -- Extensible metadata blob
  meta jsonb not null default '{}'    -- entities, tags, locations, etc.
);

create index if not exists idx_log_entries_user_logged on public.log_entries(user_id, logged_at desc);
create index if not exists idx_log_entries_user_public on public.log_entries(user_id, is_public, logged_at desc);
create index if not exists idx_log_entries_asset on public.log_entries(asset_id) where asset_id is not null;

-- RLS
alter table public.log_entries enable row level security;

-- Public read (for public entries)
create policy "Public log entries are readable by anyone"
  on public.log_entries for select
  using (is_public = true);

-- Auth users can see their own (including private)
create policy "Users can view all own log entries"
  on public.log_entries for select
  using (auth.uid() = user_id);

create policy "Users can insert own log entries"
  on public.log_entries for insert
  with check (auth.uid() = user_id);

create policy "Users can update own log entries"
  on public.log_entries for update
  using (auth.uid() = user_id);

create policy "Users can delete own log entries"
  on public.log_entries for delete
  using (auth.uid() = user_id);

create policy "Service role full access to log entries"
  on public.log_entries for all
  using (auth.role() = 'service_role');

-- Auto-update updated_at
create or replace function public.log_entries_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger log_entries_updated_at
  before update on public.log_entries
  for each row execute function public.log_entries_set_updated_at();
