-- Minimal automation substrate: jobs + job_runs (service-role only)

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists job_runs_job_id_started_at_idx
  on public.job_runs(job_id, started_at desc);

-- Lock down by default. Only service role can access unless policies are added later.
alter table public.jobs enable row level security;
alter table public.job_runs enable row level security;
