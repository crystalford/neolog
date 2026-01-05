-- Vector search support (pgvector) for semantic asset search
-- Requires: Supabase SQL Editor execution or `supabase db push`

-- Enable pgvector (safe if already enabled)
create extension if not exists vector;

-- Store embeddings for user assets
create table if not exists public.asset_embeddings (
  asset_id uuid primary key references public.assets(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade not null,
  embedding vector(1536) not null,
  content_hash text not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_asset_embeddings_user_id on public.asset_embeddings(user_id);
create index if not exists idx_asset_embeddings_updated_at on public.asset_embeddings(updated_at);

-- IVFFLAT cosine index (effective once you have enough rows)
create index if not exists idx_asset_embeddings_embedding_cosine
  on public.asset_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Helper to update updated_at
create or replace function public.asset_embeddings_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists asset_embeddings_updated_at on public.asset_embeddings;
create trigger asset_embeddings_updated_at
  before update on public.asset_embeddings
  for each row
  execute function public.asset_embeddings_touch_updated_at();

-- Match function: returns asset ids + similarity score
create or replace function public.match_assets(
  query_embedding vector(1536),
  match_count int default 20,
  user_filter uuid default null,
  type_filter text default null
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
  order by ae.embedding <=> query_embedding
  limit match_count;
$$;

-- Permissions (mirrors post vector search migration)
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.asset_embeddings to service_role;
grant execute on function public.match_assets(vector(1536), int, uuid, text) to service_role;

grant select on table public.assets to service_role;
