-- Publication scoping for audience + referrals (Subscriptions, Email subscribers, Notes/Tags, Referral programs)

-- 1) Subscriptions: add publication_id and support both "global" (null) and per-publication subscriptions
alter table public.subscriptions
  add column if not exists publication_id uuid references public.publications(id) on delete cascade;

create index if not exists idx_subscriptions_publication_id on public.subscriptions(publication_id);

-- Replace the legacy unique constraint so one subscriber can subscribe to multiple publications of the same creator.
-- We keep a single "global" subscription row (publication_id is null) per creator, and allow multiple per-publication rows.
alter table public.subscriptions drop constraint if exists unique_subscription;

do $$
begin
  -- Global subscription (publication_id is null): one per subscriber+creator
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and indexname = 'uniq_subscriptions_global'
  ) then
    execute 'create unique index uniq_subscriptions_global on public.subscriptions(subscriber_id, creator_id) where publication_id is null';
  end if;

  -- Per-publication subscription (publication_id is not null): one per subscriber+creator+publication
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and indexname = 'uniq_subscriptions_per_publication'
  ) then
    execute 'create unique index uniq_subscriptions_per_publication on public.subscriptions(subscriber_id, creator_id, publication_id) where publication_id is not null';
  end if;
end;
$$;

-- Backfill: if the creator owns exactly one publication, assign it.
update public.subscriptions s
set publication_id = p.id
from public.publications p
where s.publication_id is null
  and p.owner_id = s.creator_id
  and (
    select count(*)
    from public.publications p2
    where p2.owner_id = s.creator_id
  ) = 1;

-- 2) Email subscribers: adjust uniqueness to allow per-publication subscriptions
-- Column may already exist from add_publications.sql
alter table public.email_subscribers
  add column if not exists publication_id uuid references public.publications(id) on delete cascade;

create index if not exists idx_email_subscribers_publication_id on public.email_subscribers(publication_id);

alter table public.email_subscribers drop constraint if exists unique_email_subscriber;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'email_subscribers'
      and indexname = 'uniq_email_subscribers_global'
  ) then
    execute 'create unique index uniq_email_subscribers_global on public.email_subscribers(creator_id, email) where publication_id is null';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'email_subscribers'
      and indexname = 'uniq_email_subscribers_per_publication'
  ) then
    execute 'create unique index uniq_email_subscribers_per_publication on public.email_subscribers(creator_id, email, publication_id) where publication_id is not null';
  end if;
end;
$$;

-- Backfill: if the creator owns exactly one publication, assign it.
update public.email_subscribers es
set publication_id = p.id
from public.publications p
where es.publication_id is null
  and p.owner_id = es.creator_id
  and (
    select count(*)
    from public.publications p2
    where p2.owner_id = es.creator_id
  ) = 1;

-- 3) Subscriber notes/tags: add publication_id for proper scoping
alter table public.subscriber_notes
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

alter table public.subscriber_tags
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

create index if not exists idx_subscriber_notes_publication_id on public.subscriber_notes(publication_id);
create index if not exists idx_subscriber_tags_publication_id on public.subscriber_tags(publication_id);

-- Backfill notes/tags from the linked email_subscriber/subscription where possible
update public.subscriber_notes sn
set publication_id = es.publication_id
from public.email_subscribers es
where sn.publication_id is null
  and sn.email_subscriber_id = es.id
  and es.publication_id is not null;

update public.subscriber_notes sn
set publication_id = s.publication_id
from public.subscriptions s
where sn.publication_id is null
  and sn.subscriber_id = s.subscriber_id
  and sn.creator_id = s.creator_id
  and s.publication_id is not null;

update public.subscriber_tags st
set publication_id = es.publication_id
from public.email_subscribers es
where st.publication_id is null
  and st.email_subscriber_id = es.id
  and es.publication_id is not null;

update public.subscriber_tags st
set publication_id = s.publication_id
from public.subscriptions s
where st.publication_id is null
  and st.subscriber_id = s.subscriber_id
  and st.creator_id = s.creator_id
  and s.publication_id is not null;

-- If the creator owns exactly one publication, assign it (best-effort)
update public.subscriber_notes sn
set publication_id = p.id
from public.publications p
where sn.publication_id is null
  and p.owner_id = sn.creator_id
  and (
    select count(*)
    from public.publications p2
    where p2.owner_id = sn.creator_id
  ) = 1;

update public.subscriber_tags st
set publication_id = p.id
from public.publications p
where st.publication_id is null
  and p.owner_id = st.creator_id
  and (
    select count(*)
    from public.publications p2
    where p2.owner_id = st.creator_id
  ) = 1;

-- Update uniqueness to allow per-publication notes/tags
alter table public.subscriber_notes drop constraint if exists unique_user_subscriber_note;
alter table public.subscriber_notes drop constraint if exists unique_email_subscriber_note;
alter table public.subscriber_tags drop constraint if exists unique_user_subscriber_tag;
alter table public.subscriber_tags drop constraint if exists unique_email_subscriber_tag;

alter table public.subscriber_notes
  add constraint unique_user_subscriber_note unique (creator_id, subscriber_id, publication_id);

alter table public.subscriber_notes
  add constraint unique_email_subscriber_note unique (creator_id, email_subscriber_id, publication_id);

alter table public.subscriber_tags
  add constraint unique_user_subscriber_tag unique (creator_id, subscriber_id, publication_id, tag);

alter table public.subscriber_tags
  add constraint unique_email_subscriber_tag unique (creator_id, email_subscriber_id, publication_id, tag);

-- 4) Referral programs: add publication_id (programs are publication-specific)
alter table public.referral_programs
  add column if not exists publication_id uuid references public.publications(id) on delete cascade;

create index if not exists idx_referral_programs_publication_id on public.referral_programs(publication_id);

-- Enforce: one active program per creator per publication (and one global program if publication_id is null)
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'referral_programs'
      and indexname = 'uniq_referral_programs_global'
  ) then
    execute 'create unique index uniq_referral_programs_global on public.referral_programs(creator_id) where publication_id is null';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'referral_programs'
      and indexname = 'uniq_referral_programs_per_publication'
  ) then
    execute 'create unique index uniq_referral_programs_per_publication on public.referral_programs(creator_id, publication_id) where publication_id is not null';
  end if;
end;
$$;

-- Backfill referral programs: if creator owns exactly one publication, assign it.
update public.referral_programs rp
set publication_id = p.id
from public.publications p
where rp.publication_id is null
  and p.owner_id = rp.creator_id
  and (
    select count(*)
    from public.publications p2
    where p2.owner_id = rp.creator_id
  ) = 1;

-- 5) Subscription/referral RPC updates
-- Ensure subscriber counts can be computed without exposing subscriber rows.
create or replace function public.get_subscriber_count(target_creator_id uuid)
returns integer as $$
declare
  user_subs integer;
  email_subs integer;
begin
  select count(*) into user_subs
  from public.subscriptions
  where creator_id = target_creator_id;

  select count(*) into email_subs
  from public.email_subscribers
  where creator_id = target_creator_id
    and status = 'active';

  return user_subs + email_subs;
end;
$$ language plpgsql security definer;

-- Subscription insert now supports an optional publication_id.
create or replace function public.subscribe_to_creator(
  p_subscriber_id uuid,
  p_creator_id uuid,
  p_referral_code text default null,
  p_publication_id uuid default null
)
returns uuid as $$
declare
  v_subscription_id uuid;
  v_referral_link_id uuid;
  v_program_id uuid;
  v_bounty_cents integer;
  v_program_publication_id uuid;
  v_target_publication_id uuid;
begin
  -- Don't allow self-subscription
  if p_subscriber_id = p_creator_id then
    raise exception 'Cannot subscribe to yourself';
  end if;

  v_target_publication_id := p_publication_id;

  -- Check for referral
  if p_referral_code is not null then
    select rl.id, rl.program_id into v_referral_link_id, v_program_id
    from public.referral_links rl
    where rl.code = p_referral_code;

    if v_referral_link_id is not null then
      -- Update referral link stats
      update public.referral_links
      set signups = signups + 1
      where id = v_referral_link_id;

      -- Get bounty + publication and create conversion
      select rp.bounty_cents, rp.publication_id into v_bounty_cents, v_program_publication_id
      from public.referral_programs rp
      where rp.id = v_program_id;

      if v_target_publication_id is null then
        v_target_publication_id := v_program_publication_id;
      end if;

      if v_bounty_cents is not null then
        insert into public.referral_conversions (link_id, subscriber_id, bounty_cents)
        values (v_referral_link_id, p_subscriber_id, v_bounty_cents);
      end if;
    end if;
  end if;

  -- Create subscription
  if v_target_publication_id is null then
    insert into public.subscriptions (subscriber_id, creator_id, referral_link_id, publication_id)
    values (p_subscriber_id, p_creator_id, v_referral_link_id, null)
    on conflict (subscriber_id, creator_id) where publication_id is null do nothing
    returning id into v_subscription_id;
  else
    insert into public.subscriptions (subscriber_id, creator_id, referral_link_id, publication_id)
    values (p_subscriber_id, p_creator_id, v_referral_link_id, v_target_publication_id)
    on conflict (subscriber_id, creator_id, publication_id) do nothing
    returning id into v_subscription_id;
  end if;

  return v_subscription_id;
end;
$$ language plpgsql security definer;

-- 6) RLS
-- These tables are user-facing and queried directly from clients.
-- Policies allow creators and subscribers to access only their own rows.

alter table public.subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_select_own'
  ) then
    execute $$
      create policy subscriptions_select_own
        on public.subscriptions for select
        using (auth.uid() = subscriber_id or auth.uid() = creator_id)
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_insert_own'
  ) then
    execute $$
      create policy subscriptions_insert_own
        on public.subscriptions for insert
        with check (
          auth.uid() = subscriber_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = creator_id
            )
          )
        )
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_update_own'
  ) then
    execute $$
      create policy subscriptions_update_own
        on public.subscriptions for update
        using (auth.uid() = subscriber_id or auth.uid() = creator_id)
        with check (auth.uid() = subscriber_id or auth.uid() = creator_id)
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriptions'
      and policyname = 'subscriptions_delete_own'
  ) then
    execute $$
      create policy subscriptions_delete_own
        on public.subscriptions for delete
        using (auth.uid() = subscriber_id)
    $$;
  end if;
end;
$$;

alter table public.email_subscribers enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'email_subscribers'
      and policyname = 'email_subscribers_manage_creator'
  ) then
    execute $$
      create policy email_subscribers_manage_creator
        on public.email_subscribers for all
        using (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
        with check (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
    $$;
  end if;
end;
$$;

alter table public.subscriber_notes enable row level security;
alter table public.subscriber_tags enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriber_notes'
      and policyname = 'subscriber_notes_manage_creator'
  ) then
    execute $$
      create policy subscriber_notes_manage_creator
        on public.subscriber_notes for all
        using (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
        with check (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'subscriber_tags'
      and policyname = 'subscriber_tags_manage_creator'
  ) then
    execute $$
      create policy subscriber_tags_manage_creator
        on public.subscriber_tags for all
        using (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
        with check (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
    $$;
  end if;
end;
$$;

alter table public.referral_programs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_programs'
      and policyname = 'referral_programs_select_active'
  ) then
    execute $$
      create policy referral_programs_select_active
        on public.referral_programs for select
        using (auth.uid() is not null and is_active = true)
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_programs'
      and policyname = 'referral_programs_manage_creator'
  ) then
    execute $$
      create policy referral_programs_manage_creator
        on public.referral_programs for all
        using (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
        with check (
          auth.uid() = creator_id
          and (
            publication_id is null
            or exists (
              select 1
              from public.publications p
              where p.id = publication_id
                and p.owner_id = auth.uid()
            )
          )
        )
    $$;
  end if;
end;
$$;

alter table public.referral_links enable row level security;
alter table public.referral_conversions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_links'
      and policyname = 'referral_links_select_own'
  ) then
    execute $$
      create policy referral_links_select_own
        on public.referral_links for select
        using (auth.uid() = referrer_id)
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_links'
      and policyname = 'referral_links_insert_own'
  ) then
    execute $$
      create policy referral_links_insert_own
        on public.referral_links for insert
        with check (auth.uid() = referrer_id)
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_links'
      and policyname = 'referral_links_delete_own'
  ) then
    execute $$
      create policy referral_links_delete_own
        on public.referral_links for delete
        using (auth.uid() = referrer_id)
    $$;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'referral_conversions'
      and policyname = 'referral_conversions_select_referrer'
  ) then
    execute $$
      create policy referral_conversions_select_referrer
        on public.referral_conversions for select
        using (
          exists (
            select 1
            from public.referral_links rl
            where rl.id = link_id
              and rl.referrer_id = auth.uid()
          )
        )
    $$;
  end if;
end;
$$;
