-- Add optional publication assignment to assets (Capture-First + Publications)

-- 1) Schema: publication_id on assets
alter table public.assets
  add column if not exists publication_id uuid references public.publications(id) on delete set null;

create index if not exists assets_publication_idx on public.assets(publication_id);

-- 2) Tighten RLS so publication_id can only point to user's own publications
-- Replace the original broad policy with one that validates publication ownership.

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'assets'
      and policyname = 'Users manage own assets'
  ) then
    execute 'drop policy "Users manage own assets" on public.assets';
  end if;
end $$;

create policy "Users manage own assets"
  on public.assets for all
  using (
    auth.uid() = user_id
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
    auth.uid() = user_id
    and (
      publication_id is null
      or exists (
        select 1
        from public.publications p
        where p.id = publication_id
          and p.owner_id = auth.uid()
      )
    )
  );

-- 3) Extend match_assets() to optionally filter by publication
create or replace function public.match_assets(
  query_embedding vector(1536),
  match_count int default 20,
  user_filter uuid default null,
  type_filter text default null,
  publication_filter uuid default null
)
returns table (
  asset_id uuid,
  score float
)
language sql
stable
as $$
  select
    ae.asset_id,
    (1 - (ae.embedding <=> query_embedding)) as score
  from public.asset_embeddings ae
  join public.assets a on a.id = ae.asset_id
  where (user_filter is null or ae.user_id = user_filter)
    and (type_filter is null or a.type = type_filter)
    and (publication_filter is null or a.publication_id = publication_filter)
  order by ae.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_assets(vector(1536), int, uuid, text, uuid) to service_role;
