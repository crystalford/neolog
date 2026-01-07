-- Feed sources: health tracking + backoff

alter table public.feed_sources
  add column if not exists consecutive_failures integer default 0;

alter table public.feed_sources
  add column if not exists last_fetch_status_code integer;

alter table public.feed_sources
  add column if not exists last_error text;

alter table public.feed_sources
  add column if not exists last_success_at timestamptz;

create index if not exists feed_sources_user_active_idx on public.feed_sources(user_id, is_active);
create index if not exists feed_sources_failures_idx on public.feed_sources(consecutive_failures);
