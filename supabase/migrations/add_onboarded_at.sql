-- Adds onboarding completion marker for gating username setup

alter table public.profiles
  add column if not exists onboarded_at timestamptz;

-- Mark existing profiles as onboarded so we don't force legacy users back through onboarding.
update public.profiles
set onboarded_at = coalesce(onboarded_at, created_at, now())
where onboarded_at is null;
