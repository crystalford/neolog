-- Vector search support (pgvector) for semantic post search
-- Requires: Supabase SQL Editor execution or `supabase db push`

-- Enable pgvector
create extension if not exists vector;

-- Store embeddings for published posts
create table if not exists public.post_embeddings (
  post_id uuid primary key references public.posts(id) on delete cascade,
  embedding vector(1536) not null,
  content_hash text not null,
  updated_at timestamptz default now() not null
);

create index if not exists idx_post_embeddings_updated_at on public.post_embeddings(updated_at);

-- IVFFLAT cosine index (effective once you have enough rows)
create index if not exists idx_post_embeddings_embedding_cosine
  on public.post_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Helper to update updated_at
create or replace function public.post_embeddings_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists post_embeddings_updated_at on public.post_embeddings;
create trigger post_embeddings_updated_at
  before update on public.post_embeddings
  for each row
  execute function public.post_embeddings_touch_updated_at();

-- Match function: returns post ids + similarity score
create or replace function public.match_posts(
  query_embedding vector(1536),
  match_count int default 10,
  author_filter uuid default null
)
returns table (
  post_id uuid,
  score float
)
language sql
stable
as $$
  select
    pe.post_id,
    (1 - (pe.embedding <=> query_embedding)) as score
  from public.post_embeddings pe
  join public.posts p on p.id = pe.post_id
  where p.status = 'published'
    and (author_filter is null or p.author_id = author_filter)
  order by pe.embedding <=> query_embedding
  limit match_count;
$$;

-- Permissions: service_role should be able to read/write these tables in scripts/routes.
-- (Some Supabase setups can end up missing these grants.)
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.post_embeddings to service_role;
grant execute on function public.match_posts(vector(1536), int, uuid) to service_role;

-- Ensure service_role can read these core tables for admin utilities.
grant select on table public.profiles to service_role;
grant select, insert, update, delete on table public.posts to service_role;
grant select, insert, update, delete on table public.publications to service_role;
