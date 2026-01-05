-- Auto-post syndication: track external cross-posts per post/provider

create table if not exists public.post_syndications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('medium', 'devto')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'error')),
  external_id text,
  external_url text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, provider)
);

create index if not exists post_syndications_author_id_idx on public.post_syndications(author_id);
create index if not exists post_syndications_post_id_idx on public.post_syndications(post_id);
create index if not exists post_syndications_provider_idx on public.post_syndications(provider);

alter table public.post_syndications enable row level security;

-- Authors can see their own syndication events
create policy "post_syndications_select_own" on public.post_syndications
  for select
  using (author_id = auth.uid());

-- Authors can insert/update their own rows (server-side uses user session)
create policy "post_syndications_insert_own" on public.post_syndications
  for insert
  with check (author_id = auth.uid());

create policy "post_syndications_update_own" on public.post_syndications
  for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());
