-- Allow authenticated read-only access to jobs/job_runs.
-- Writes remain service-role only (no insert/update/delete policies).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jobs'
      and policyname = 'jobs_select_authenticated'
  ) then
    create policy jobs_select_authenticated
      on public.jobs
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'job_runs'
      and policyname = 'job_runs_select_authenticated'
  ) then
    create policy job_runs_select_authenticated
      on public.job_runs
      for select
      to authenticated
      using (true);
  end if;
end $$;
