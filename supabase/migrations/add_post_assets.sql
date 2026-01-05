-- Join table linking posts to vault assets

create table if not exists public.post_assets (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  asset_id uuid references public.assets(id) on delete cascade not null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint unique_post_asset unique (post_id, asset_id)
);

create index if not exists post_assets_post_idx on public.post_assets(post_id);
create index if not exists post_assets_asset_idx on public.post_assets(asset_id);

alter table public.post_assets enable row level security;

-- Minimal V1 policy: only the post author can manage links, and only to their own assets.
create policy "Authors manage post assets"
  on public.post_assets for all
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
    and exists (
      select 1 from public.assets a
      where a.id = asset_id and a.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
    and exists (
      select 1 from public.assets a
      where a.id = asset_id and a.user_id = auth.uid()
    )
  );
