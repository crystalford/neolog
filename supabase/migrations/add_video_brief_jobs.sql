-- Add provider job fields for HeyGen/Synthesia generation + polling

alter table public.video_briefs
  add column if not exists provider_job_id text;

alter table public.video_briefs
  add column if not exists video_url text;

-- Expand status enum to include processing
alter table public.video_briefs drop constraint if exists video_briefs_status_check;
alter table public.video_briefs drop constraint if exists video_briefs_status_check1;

alter table public.video_briefs
  add constraint video_briefs_status_check
  check (status in ('queued', 'processing', 'ready', 'error'));

create index if not exists video_briefs_provider_job_id_idx on public.video_briefs(provider_job_id);
