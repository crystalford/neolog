-- Create publications table (Substack-style multi-blog support)
create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  slug text unique not null,
  description text,
  logo_url text,
  cover_url text,
  custom_domain text unique,

  -- Branding
  primary_color text default '#6366f1',
  accent_color text default '#8b5cf6',

  -- Settings
  is_active boolean default true,
  allow_comments boolean default true,
  allow_reactions boolean default true,
  enable_paywall boolean default false,

  -- Social links
  twitter_url text,
  github_url text,
  website_url text,

  -- Metadata
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Stats (denormalized for performance)
  total_posts integer default 0,
  total_subscribers integer default 0,
  total_views integer default 0
);

-- Add publication_id to posts table
alter table public.posts
add column if not exists publication_id uuid references public.publications(id) on delete cascade;

-- Create index for faster lookups
create index if not exists idx_posts_publication_id on public.posts(publication_id);
create index if not exists idx_publications_owner_id on public.publications(owner_id);
create index if not exists idx_publications_slug on public.publications(slug);

-- Add publication_id to email_subscribers
alter table public.email_subscribers
add column if not exists publication_id uuid references public.publications(id) on delete cascade;

create index if not exists idx_email_subscribers_publication_id on public.email_subscribers(publication_id);

-- Enable RLS
alter table public.publications enable row level security;

-- RLS Policies
create policy "Publications are viewable by everyone"
  on public.publications for select
  using (is_active = true);

create policy "Users can insert their own publications"
  on public.publications for insert
  with check (auth.uid() = owner_id);

create policy "Users can update their own publications"
  on public.publications for update
  using (auth.uid() = owner_id);

create policy "Users can delete their own publications"
  on public.publications for delete
  using (auth.uid() = owner_id);

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-update updated_at
create trigger publications_updated_at
  before update on public.publications
  for each row
  execute function public.handle_updated_at();

-- Function to increment publication stats
create or replace function public.increment_publication_posts()
returns trigger as $$
begin
  if new.publication_id is not null then
    update public.publications
    set total_posts = total_posts + 1
    where id = new.publication_id;
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to auto-increment post count
create trigger publications_post_count
  after insert on public.posts
  for each row
  execute function public.increment_publication_posts();

-- Create publication_members table for team collaboration
create table if not exists public.publication_members (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid references public.publications(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('owner', 'admin', 'editor', 'writer')),
  invited_by uuid references auth.users(id),
  joined_at timestamptz default now(),

  unique(publication_id, user_id)
);

create index if not exists idx_publication_members_publication_id on public.publication_members(publication_id);
create index if not exists idx_publication_members_user_id on public.publication_members(user_id);

-- Enable RLS for publication_members
alter table public.publication_members enable row level security;

create policy "Publication members are viewable by publication members"
  on public.publication_members for select
  using (
    exists (
      select 1 from public.publications
      where id = publication_id and owner_id = auth.uid()
    )
    or user_id = auth.uid()
  );

create policy "Publication owners can manage members"
  on public.publication_members for all
  using (
    exists (
      select 1 from public.publications
      where id = publication_id and owner_id = auth.uid()
    )
  );

-- Comment for documentation
comment on table public.publications is 'Multi-publication support - users can create and manage multiple blogs/publications';
comment on table public.publication_members is 'Team members and collaborators for publications';
