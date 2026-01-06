-- Indexes to keep job run queries fast as the table grows.
-- Safe to apply after add_jobs_job_runs.sql.

create index if not exists job_runs_started_at_idx
  on public.job_runs (started_at desc);

create index if not exists job_runs_job_id_started_at_idx
  on public.job_runs (job_id, started_at desc);

create unique index if not exists jobs_name_idx
  on public.jobs (name);
