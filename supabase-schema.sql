-- =============================================
-- NEOLOG DATABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- =============================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- =============================================
-- PROFILES TABLE
-- Extends Supabase auth.users with public profile data
-- =============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  bio text,
  avatar_url text,
  website_url text,
  twitter_url text,
  github_url text,
  linkedin_url text,
  context_md text,
  is_pro boolean default false,
  onboarded_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- Constraints
  constraint username_length check (char_length(username) >= 3 and char_length(username) <= 30),
  constraint username_format check (username ~* '^[a-z0-9_]+$')
);

-- =============================================
-- ACTIVITYPUB KEYS TABLE
-- Stores per-user ActivityPub keypairs for signing
-- =============================================
create table public.activitypub_keys (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  public_key_pem text not null,
  private_key_pem text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =============================================
-- POSTS TABLE
-- The core content table with forking support
-- =============================================
create table public.posts (
  id uuid default uuid_generate_v4() primary key,
  author_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Forking relationships
  forked_from_id uuid references public.posts(id) on delete set null,
  root_post_id uuid references public.posts(id) on delete set null, -- The original ancestor
  fork_depth integer default 0, -- How many forks deep (0 = original)
  
  -- Content
  title text not null,
  slug text not null,
  subtitle text,
  content text, -- The HTML/markdown content
  content_html text, -- Rendered HTML for display
  content_type text default 'html' check (content_type in ('html', 'markdown', 'rich', 'pulse')),
  
  -- Metadata
  cover_image_url text,
  excerpt text, -- Auto-generated or manual summary
  reading_time_minutes integer,
  
  -- Forking settings
  allow_forks boolean default true,
  fork_count integer default 0, -- Denormalized for performance
  
  -- Status
  status text default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamp with time zone,
  
  -- Timestamps
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Unique slug per author
  constraint unique_author_slug unique (author_id, slug)
);

-- =============================================
-- POST_VERSIONS TABLE
-- Git-style version history for every post
-- =============================================
create table public.post_versions (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  
  -- Version info
  version_number integer not null,
  
  -- Snapshot of content at this version
  title text not null,
  content text,
  content_html text,
  
  -- Change metadata
  change_summary text, -- Optional: "Updated introduction", "Fixed typos"
  changed_by uuid references public.profiles(id) on delete set null,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- One version number per post
  constraint unique_post_version unique (post_id, version_number)
);

-- =============================================
-- POST_EMBEDDINGS TABLE
-- Semantic search support (pgvector)
-- =============================================
create table public.post_embeddings (
  post_id uuid primary key references public.posts(id) on delete cascade,
  embedding vector(1536) not null,
  content_hash text not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =============================================
-- POST DISTRIBUTION PACKS
-- Generated share-ready assets (threads, hooks, OG)
-- =============================================
create table public.post_distribution_packs (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending' check (status in ('pending', 'ready', 'error')),
    x_thread text[] default '{}',
    threads_post text,
    bluesky_post text,
    linkedin_post text,
    reddit_title text,
    reddit_body text,
    hooks text[] default '{}',
    og_image_url text,
    medium_html text,
    devto_markdown text,
    newsletter_subject text,
    newsletter_preview text,
    newsletter_body text,
  error_message text,
  model text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint unique_post_distribution_pack unique (post_id)
);

-- =============================================
-- CURATED COMMENTS (external highlights)
-- =============================================
create table public.curated_comments (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  source text not null check (source in ('reddit', 'x', 'manual')),
  source_url text,
  author_name text,
  author_url text,
  body text not null,
  score integer default 0,
  is_pinned boolean default false,
  manual_rank integer default 0,
  created_at timestamp with time zone,
  imported_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =============================================
-- POST SUMMARIES (AI-generated)
-- =============================================
create table public.post_summaries (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  summary text,
  bullets text[] default '{}',
  model text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint unique_post_summary unique (post_id)
);

-- =============================================
-- AUTHOR TOPIC INTROS
-- Per-author descriptions for topics
-- =============================================
create table public.author_topic_intros (
  id uuid default uuid_generate_v4() primary key,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  tag_id uuid references public.tags(id) on delete cascade not null,
  intro text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint unique_author_topic_intro unique (creator_id, tag_id)
);

-- =============================================
-- POST_COLLABORATORS TABLE
-- Multiple authors on a single post
-- =============================================
create table public.post_collaborators (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Role: owner (original author), editor (can edit), viewer (can view drafts)
  role text default 'editor' check (role in ('owner', 'editor', 'viewer')),
  
  -- Attribution
  display_in_byline boolean default true,
  contribution_note text, -- "Illustrations by", "Research by", etc.
  
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  added_by uuid references public.profiles(id) on delete set null,
  
  constraint unique_post_collaborator unique (post_id, user_id)
);

-- =============================================
-- TAGS TABLE
-- For categorizing posts
-- =============================================
create table public.tags (
  id uuid default uuid_generate_v4() primary key,
  name text unique not null,
  slug text unique not null,
  description text,
  color text default '#6b7280',
  post_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =============================================
-- POST_TAGS TABLE
-- Many-to-many relationship between posts and tags
-- =============================================
create table public.post_tags (
  post_id uuid references public.posts(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

-- =============================================
-- DRAFTS TABLE
-- Auto-saved drafts (separate from published posts)
-- =============================================
create table public.drafts (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete cascade not null,
  
  title text,
  content text,
  content_type text default 'html',
  
  -- Auto-save metadata
  saved_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- One draft per post (or standalone draft if post_id is null)
  constraint unique_post_draft unique (post_id)
);

-- =============================================
-- SUBSCRIPTIONS / FOLLOWS
-- Core social graph for the network
-- =============================================

-- Subscriptions (following creators)
create table public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  
  -- Who is subscribing
  subscriber_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Who they're subscribing to
  creator_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Subscription type
  tier text default 'free' check (tier in ('free', 'paid', 'founding')),
  
  -- For paid subscriptions
  stripe_subscription_id text,
  price_cents integer,
  
  -- Email preferences
  email_new_posts boolean default true,
  email_weekly_digest boolean default false,
  
  -- Referral tracking (added later via ALTER TABLE after referral_links exists)
  referral_link_id uuid,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_subscription unique (subscriber_id, creator_id)
);

-- Email list (for non-user subscribers - email-only)
create table public.email_subscribers (
  id uuid default uuid_generate_v4() primary key,
  
  -- Which creator they're subscribed to
  creator_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Subscriber info
  email text not null,
  name text,
  
  -- Status
  status text default 'pending' check (status in ('pending', 'active', 'unsubscribed', 'bounced', 'complained')),
  
  -- Email preferences
  email_new_posts boolean default true,
  email_weekly_digest boolean default false,
  
  -- Verification
  confirmed boolean default false,
  confirmation_token text default encode(gen_random_bytes(16), 'hex'),
  confirmed_at timestamp with time zone,
  
  -- Unsubscribe
  unsubscribe_token text default encode(gen_random_bytes(16), 'hex'),
  unsubscribed_at timestamp with time zone,
  
  -- Source tracking
  source text, -- 'website', 'import', 'api', etc.
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_email_subscriber unique (creator_id, email)
);

-- Subscriber notes (creator-only notes for audience management)
create table public.subscriber_notes (
  id uuid default uuid_generate_v4() primary key,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  subscriber_id uuid references public.profiles(id) on delete cascade,
  email_subscriber_id uuid references public.email_subscribers(id) on delete cascade,
  note text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint subscriber_note_target check (
    (subscriber_id is not null and email_subscriber_id is null)
    or (subscriber_id is null and email_subscriber_id is not null)
  ),
  constraint unique_user_subscriber_note unique (creator_id, subscriber_id),
  constraint unique_email_subscriber_note unique (creator_id, email_subscriber_id)
);

-- Subscriber tags (lightweight labeling for audience management)
create table public.subscriber_tags (
  id uuid default uuid_generate_v4() primary key,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  subscriber_id uuid references public.profiles(id) on delete cascade,
  email_subscriber_id uuid references public.email_subscribers(id) on delete cascade,
  tag text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint subscriber_tag_target check (
    (subscriber_id is not null and email_subscriber_id is null)
    or (subscriber_id is null and email_subscriber_id is not null)
  ),
  constraint unique_user_subscriber_tag unique (creator_id, subscriber_id, tag),
  constraint unique_email_subscriber_tag unique (creator_id, email_subscriber_id, tag)
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================
create index posts_author_id_idx on public.posts(author_id);
create index posts_status_idx on public.posts(status);
create index posts_published_at_idx on public.posts(published_at desc);
create index posts_slug_idx on public.posts(slug);
create index posts_forked_from_idx on public.posts(forked_from_id);
create index posts_root_post_idx on public.posts(root_post_id);
create index post_versions_post_id_idx on public.post_versions(post_id);
create index post_distribution_packs_post_id_idx on public.post_distribution_packs(post_id);
create index post_distribution_packs_author_id_idx on public.post_distribution_packs(author_id);
create index curated_comments_post_id_idx on public.curated_comments(post_id);
create index curated_comments_author_id_idx on public.curated_comments(author_id);
create index curated_comments_pinned_idx on public.curated_comments(post_id, is_pinned);
create index post_summaries_post_id_idx on public.post_summaries(post_id);
create index post_summaries_author_id_idx on public.post_summaries(author_id);
create index author_topic_intros_creator_idx on public.author_topic_intros(creator_id);
create index author_topic_intros_tag_idx on public.author_topic_intros(tag_id);
create index post_collaborators_post_id_idx on public.post_collaborators(post_id);
create index post_collaborators_user_id_idx on public.post_collaborators(user_id);
create index drafts_author_id_idx on public.drafts(author_id);
create index profiles_username_idx on public.profiles(username);
create index subscriptions_subscriber_idx on public.subscriptions(subscriber_id);
create index subscriptions_creator_idx on public.subscriptions(creator_id);
create index email_subscribers_creator_idx on public.email_subscribers(creator_id);
create index email_subscribers_email_idx on public.email_subscribers(email);
create index subscriber_notes_creator_idx on public.subscriber_notes(creator_id);
create index subscriber_notes_subscriber_idx on public.subscriber_notes(subscriber_id);
create index subscriber_notes_email_subscriber_idx on public.subscriber_notes(email_subscriber_id);
create index subscriber_tags_creator_idx on public.subscriber_tags(creator_id);
create index subscriber_tags_subscriber_idx on public.subscriber_tags(subscriber_id);
create index subscriber_tags_email_subscriber_idx on public.subscriber_tags(email_subscriber_id);
create index subscriber_tags_tag_idx on public.subscriber_tags(tag);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- This is what makes your data secure
-- =============================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.activitypub_keys enable row level security;
alter table public.posts enable row level security;
alter table public.post_versions enable row level security;
alter table public.post_distribution_packs enable row level security;
alter table public.curated_comments enable row level security;
alter table public.post_summaries enable row level security;
alter table public.author_topic_intros enable row level security;
alter table public.post_collaborators enable row level security;
alter table public.tags enable row level security;
alter table public.post_tags enable row level security;
alter table public.drafts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.email_subscribers enable row level security;
alter table public.subscriber_notes enable row level security;
alter table public.subscriber_tags enable row level security;

-- PROFILES policies
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- POSTS policies
create policy "Published posts are viewable by everyone"
  on public.posts for select
  using (
    status = 'published' 
    or auth.uid() = author_id
    or exists (
      select 1 from public.post_collaborators
      where post_id = id and user_id = auth.uid()
    )
  );

create policy "Users can create own posts"
  on public.posts for insert
  with check (auth.uid() = author_id);

create policy "Users can update own posts or collaborated posts"
  on public.posts for update
  using (
    auth.uid() = author_id
    or exists (
      select 1 from public.post_collaborators
      where post_id = id and user_id = auth.uid() and role in ('owner', 'editor')
    )
  );

create policy "Users can delete own posts"
  on public.posts for delete
  using (auth.uid() = author_id);

-- POST_VERSIONS policies
create policy "Versions viewable if post is viewable"
  on public.post_versions for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id 
      and (posts.status = 'published' or posts.author_id = auth.uid())
    )
  );

create policy "Post authors and collaborators can create versions"
  on public.post_versions for insert
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_id 
      and (
        posts.author_id = auth.uid()
        or exists (
          select 1 from public.post_collaborators
          where post_collaborators.post_id = posts.id 
          and post_collaborators.user_id = auth.uid()
          and post_collaborators.role in ('owner', 'editor')
        )
      )
    )
  );

-- POST_DISTRIBUTION_PACKS policies
create policy "Authors can view distribution packs"
  on public.post_distribution_packs for select
  using (auth.uid() = author_id);

create policy "Authors can manage distribution packs"
  on public.post_distribution_packs for all
  using (auth.uid() = author_id);

-- CURATED_COMMENTS policies
create policy "Curated comments visible for published posts"
  on public.curated_comments for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id and posts.status = 'published'
    )
    or auth.uid() = author_id
  );

create policy "Authors can manage curated comments"
  on public.curated_comments for all
  using (auth.uid() = author_id);

-- POST_SUMMARIES policies
create policy "Summaries visible for published posts"
  on public.post_summaries for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id and posts.status = 'published'
    )
    or auth.uid() = author_id
  );

create policy "Authors can manage summaries"
  on public.post_summaries for all
  using (auth.uid() = author_id);

-- AUTHOR_TOPIC_INTROS policies
create policy "Topic intros visible for published posts"
  on public.author_topic_intros for select
  using (true);

create policy "Authors can manage topic intros"
  on public.author_topic_intros for all
  using (auth.uid() = creator_id);

-- POST_COLLABORATORS policies
create policy "Collaborators viewable by post viewers"
  on public.post_collaborators for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id
      and (posts.status = 'published' or posts.author_id = auth.uid())
    )
  );

create policy "Post owners can manage collaborators"
  on public.post_collaborators for all
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id and posts.author_id = auth.uid()
    )
  );

-- TAGS policies (public read, authenticated write)
create policy "Tags are viewable by everyone"
  on public.tags for select
  using (true);

create policy "Authenticated users can create tags"
  on public.tags for insert
  with check (auth.role() = 'authenticated');

-- POST_TAGS policies
create policy "Post tags are viewable by everyone"
  on public.post_tags for select
  using (true);

create policy "Post authors can manage post tags"
  on public.post_tags for all
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id and posts.author_id = auth.uid()
    )
  );

-- DRAFTS policies
create policy "Users can only see own drafts"
  on public.drafts for select
  using (auth.uid() = author_id);

create policy "Users can create own drafts"
  on public.drafts for insert
  with check (auth.uid() = author_id);

create policy "Users can update own drafts"
  on public.drafts for update
  using (auth.uid() = author_id);

create policy "Users can delete own drafts"
  on public.drafts for delete
  using (auth.uid() = author_id);

-- =============================================
-- FUNCTIONS & TRIGGERS
-- =============================================

-- Function to automatically create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(
      lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g')),
      'user_' || substr(new.id::text, 1, 8)
    ),
    split_part(new.email, '@', 1)
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to run above function on signup
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Triggers for updated_at
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger posts_updated_at
  before update on public.posts
  for each row execute procedure public.handle_updated_at();

create trigger post_distribution_packs_updated_at
  before update on public.post_distribution_packs
  for each row execute procedure public.handle_updated_at();

create trigger post_summaries_updated_at
  before update on public.post_summaries
  for each row execute procedure public.handle_updated_at();

create trigger author_topic_intros_updated_at
  before update on public.author_topic_intros
  for each row execute procedure public.handle_updated_at();

create trigger subscriber_notes_updated_at
  before update on public.subscriber_notes
  for each row execute procedure public.handle_updated_at();

-- Function to calculate reading time
create or replace function public.calculate_reading_time(content text)
returns integer as $$
declare
  word_count integer;
  words_per_minute integer := 200;
begin
  word_count := array_length(
    regexp_split_to_array(
      regexp_replace(content, '<[^>]*>', ' ', 'g'),
      '\s+'
    ),
    1
  );
  return greatest(1, ceil(word_count::float / words_per_minute));
end;
$$ language plpgsql;

-- Function to increment fork count when a post is forked
create or replace function public.increment_fork_count()
returns trigger as $$
begin
  if new.forked_from_id is not null then
    update public.posts 
    set fork_count = fork_count + 1 
    where id = new.forked_from_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger on_post_forked
  after insert on public.posts
  for each row execute procedure public.increment_fork_count();

-- Function to create initial version when post is published
create or replace function public.create_initial_version()
returns trigger as $$
begin
  if new.status = 'published' and (old.status is null or old.status != 'published') then
    insert into public.post_versions (post_id, version_number, title, content, content_html, changed_by, change_summary)
    values (new.id, 1, new.title, new.content, new.content_html, new.author_id, 'Initial publication')
    on conflict (post_id, version_number) do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger on_post_published
  after insert or update on public.posts
  for each row execute procedure public.create_initial_version();

-- Function to get fork tree for a post
create or replace function public.get_fork_tree(post_uuid uuid)
returns table (
  id uuid,
  title text,
  author_username text,
  author_display_name text,
  fork_depth integer,
  forked_from_id uuid,
  published_at timestamp with time zone,
  fork_count integer
) as $$
begin
  return query
  with recursive fork_tree as (
    -- Start with the given post
    select p.id, p.title, p.fork_depth, p.forked_from_id, p.published_at, p.fork_count, p.author_id
    from public.posts p
    where p.id = post_uuid and p.status = 'published'
    
    union all
    
    -- Get all forks of posts in the tree
    select p.id, p.title, p.fork_depth, p.forked_from_id, p.published_at, p.fork_count, p.author_id
    from public.posts p
    inner join fork_tree ft on p.forked_from_id = ft.id
    where p.status = 'published'
  )
  select 
    ft.id,
    ft.title,
    pr.username as author_username,
    pr.display_name as author_display_name,
    ft.fork_depth,
    ft.forked_from_id,
    ft.published_at,
    ft.fork_count
  from fork_tree ft
  join public.profiles pr on pr.id = ft.author_id
  order by ft.fork_depth, ft.published_at;
end;
$$ language plpgsql;

-- =============================================
-- ANALYTICS TABLES
-- Track reader engagement for creator insights
-- =============================================

-- Post views - track each view session
create table public.post_views (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  viewer_id uuid references public.profiles(id) on delete set null, -- null for anonymous
  
  -- Session info
  session_id text not null, -- anonymous session tracking
  
  -- Engagement metrics
  time_on_page integer default 0, -- seconds
  scroll_depth integer default 0, -- percentage (0-100)
  read_complete boolean default false, -- reached end of content
  
  -- Interaction signals
  highlighted boolean default false, -- user highlighted text
  shared boolean default false,
  forked boolean default false,
  
  -- Source tracking
  referrer text,
  referrer_domain text,
  
  -- Device info
  device_type text check (device_type in ('desktop', 'mobile', 'tablet')),
  
  -- Timestamps
  started_at timestamp with time zone default timezone('utc'::text, now()) not null,
  ended_at timestamp with time zone,
  
  -- Prevent duplicate sessions
  constraint unique_view_session unique (post_id, session_id)
);

-- Reading progress snapshots - where readers drop off
create table public.reading_progress (
  id uuid default uuid_generate_v4() primary key,
  view_id uuid references public.post_views(id) on delete cascade not null,
  
  -- Progress at this snapshot
  scroll_position integer not null, -- percentage
  time_elapsed integer not null, -- seconds since start
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Aggregated post stats (updated periodically for performance)
create table public.post_stats (
  post_id uuid references public.posts(id) on delete cascade primary key,
  
  -- View counts
  total_views integer default 0,
  unique_viewers integer default 0,
  
  -- Engagement
  avg_time_on_page integer default 0, -- seconds
  avg_scroll_depth integer default 0, -- percentage
  completion_rate integer default 0, -- percentage who finished
  
  -- Sources
  views_from_feed integer default 0,
  views_from_profile integer default 0,
  views_from_search integer default 0,
  views_from_external integer default 0,
  views_from_fork integer default 0,
  
  -- Devices
  views_desktop integer default 0,
  views_mobile integer default 0,
  views_tablet integer default 0,
  
  -- Time series (last 30 days)
  daily_views jsonb default '[]'::jsonb, -- [{date, views, uniques}]
  
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Creator reputation / curator scores
create table public.curator_scores (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  
  -- Overall score (0-100)
  score integer default 50,
  
  -- Component metrics
  early_upvotes integer default 0, -- upvoted posts before they went big
  quality_ratio float default 0.5, -- % of upvoted posts that performed well
  consistency_score integer default 50, -- how consistent their taste is
  
  -- Domain expertise (derived from engagement patterns)
  expertise_domains jsonb default '[]'::jsonb, -- [{domain, score, post_count}]
  
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Post upvotes (for curation tracking)
create table public.post_upvotes (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  
  -- When upvoted (important for early detection scoring)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Post metrics at time of upvote (for curator scoring)
  post_views_at_upvote integer default 0,
  
  constraint unique_upvote unique (post_id, user_id)
);

-- Indexes for analytics queries
create index post_views_post_id_idx on public.post_views(post_id);
create index post_views_viewer_id_idx on public.post_views(viewer_id);
create index post_views_started_at_idx on public.post_views(started_at);
create index reading_progress_view_id_idx on public.reading_progress(view_id);
create index post_upvotes_post_id_idx on public.post_upvotes(post_id);
create index post_upvotes_user_id_idx on public.post_upvotes(user_id);

-- RLS for analytics tables
alter table public.post_views enable row level security;
alter table public.reading_progress enable row level security;
alter table public.post_stats enable row level security;
alter table public.curator_scores enable row level security;
alter table public.post_upvotes enable row level security;

-- Post views: anyone can insert (tracking), only post author can read
create policy "Anyone can create post views"
  on public.post_views for insert
  with check (true);

create policy "Authors can view their post analytics"
  on public.post_views for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id and posts.author_id = auth.uid()
    )
  );

-- Reading progress follows post_views permissions
create policy "Anyone can insert reading progress"
  on public.reading_progress for insert
  with check (true);

create policy "Authors can view reading progress"
  on public.reading_progress for select
  using (
    exists (
      select 1 from public.post_views pv
      join public.posts p on p.id = pv.post_id
      where pv.id = view_id and p.author_id = auth.uid()
    )
  );

-- Post stats: only post author can read
create policy "Authors can view post stats"
  on public.post_stats for select
  using (
    exists (
      select 1 from public.posts
      where posts.id = post_id and posts.author_id = auth.uid()
    )
  );

-- Curator scores: public read
create policy "Curator scores are public"
  on public.curator_scores for select
  using (true);

-- Upvotes: authenticated users can create, public read
create policy "Authenticated users can upvote"
  on public.post_upvotes for insert
  with check (auth.uid() = user_id);

create policy "Upvotes are public"
  on public.post_upvotes for select
  using (true);

create policy "Users can remove own upvotes"
  on public.post_upvotes for delete
  using (auth.uid() = user_id);

-- Function to update post stats (call periodically or on demand)
create or replace function public.update_post_stats(target_post_id uuid)
returns void as $$
begin
  insert into public.post_stats (post_id, total_views, unique_viewers, avg_time_on_page, avg_scroll_depth, completion_rate)
  select 
    target_post_id,
    count(*),
    count(distinct coalesce(viewer_id::text, session_id)),
    coalesce(avg(time_on_page)::integer, 0),
    coalesce(avg(scroll_depth)::integer, 0),
    coalesce((count(*) filter (where read_complete) * 100 / nullif(count(*), 0))::integer, 0)
  from public.post_views
  where post_id = target_post_id
  on conflict (post_id) do update set
    total_views = excluded.total_views,
    unique_viewers = excluded.unique_viewers,
    avg_time_on_page = excluded.avg_time_on_page,
    avg_scroll_depth = excluded.avg_scroll_depth,
    completion_rate = excluded.completion_rate,
    updated_at = now();
end;
$$ language plpgsql;

-- Function to get drop-off points for a post
create or replace function public.get_dropoff_points(target_post_id uuid)
returns table (
  scroll_bucket integer,
  drop_count bigint,
  percentage numeric
) as $$
begin
  return query
  with max_progress as (
    select 
      pv.id as view_id,
      max(rp.scroll_position) as max_scroll
    from public.post_views pv
    left join public.reading_progress rp on rp.view_id = pv.id
    where pv.post_id = target_post_id
    group by pv.id
  ),
  total_views as (
    select count(*) as total from max_progress
  )
  select 
    (max_scroll / 10 * 10)::integer as scroll_bucket,
    count(*) as drop_count,
    round(count(*) * 100.0 / nullif((select total from total_views), 0), 1) as percentage
  from max_progress
  where max_scroll is not null
  group by scroll_bucket
  order by scroll_bucket;
end;
$$ language plpgsql;

-- =============================================
-- CURATOR SCORING SYSTEM
-- Rewards users who consistently find quality content early
-- =============================================

-- Function to calculate if an upvote was "early"
-- Early = upvoted when post had < 100 views and post later got > 1000 views
create or replace function public.check_early_upvote(
  upvote_views integer,
  current_views integer
) returns boolean as $$
begin
  -- Upvoted when < 100 views, post later got > 500 views = early find
  return upvote_views < 100 and current_views > 500;
end;
$$ language plpgsql;

-- Function to update curator score for a user
create or replace function public.update_curator_score(target_user_id uuid)
returns void as $$
declare
  total_upvotes integer;
  early_count integer;
  quality_count integer;
  new_score integer;
  quality_ratio_val float;
begin
  -- Get total upvotes by this user
  select count(*) into total_upvotes
  from public.post_upvotes
  where user_id = target_user_id;

  -- If no upvotes, set default score
  if total_upvotes = 0 then
    insert into public.curator_scores (user_id, score, early_upvotes, quality_ratio)
    values (target_user_id, 50, 0, 0.5)
    on conflict (user_id) do update set
      score = 50,
      early_upvotes = 0,
      quality_ratio = 0.5,
      updated_at = now();
    return;
  end if;

  -- Count early upvotes (upvoted < 100 views, post now has > 500 views)
  select count(*) into early_count
  from public.post_upvotes pu
  join public.post_stats ps on ps.post_id = pu.post_id
  where pu.user_id = target_user_id
    and pu.post_views_at_upvote < 100
    and ps.total_views > 500;

  -- Count quality upvotes (posts that performed well: > 70% avg completion)
  select count(*) into quality_count
  from public.post_upvotes pu
  join public.post_stats ps on ps.post_id = pu.post_id
  where pu.user_id = target_user_id
    and ps.completion_rate > 70;

  -- Calculate quality ratio
  quality_ratio_val := quality_count::float / greatest(total_upvotes, 1);

  -- Calculate score (0-100)
  -- Formula: base 50 + early bonus (up to 25) + quality bonus (up to 25)
  new_score := 50 
    + least(25, early_count * 5)  -- 5 points per early find, max 25
    + least(25, (quality_ratio_val * 25)::integer);  -- quality ratio * 25

  -- Update or insert curator score
  insert into public.curator_scores (user_id, score, early_upvotes, quality_ratio)
  values (target_user_id, new_score, early_count, quality_ratio_val)
  on conflict (user_id) do update set
    score = new_score,
    early_upvotes = early_count,
    quality_ratio = quality_ratio_val,
    updated_at = now();
end;
$$ language plpgsql;

-- Function to update expertise domains for a user based on their reading/upvoting patterns
create or replace function public.update_expertise_domains(target_user_id uuid)
returns void as $$
declare
  domain_data jsonb;
begin
  -- Get domains from posts the user has upvoted, weighted by post quality
  with user_upvoted_posts as (
    select p.id, pt.tag_id, ps.completion_rate
    from public.post_upvotes pu
    join public.posts p on p.id = pu.post_id
    join public.post_tags pt on pt.post_id = p.id
    left join public.post_stats ps on ps.post_id = p.id
    where pu.user_id = target_user_id
  ),
  domain_scores as (
    select 
      t.name as domain,
      count(*) as post_count,
      avg(coalesce(up.completion_rate, 50)) as avg_quality
    from user_upvoted_posts up
    join public.tags t on t.id = up.tag_id
    group by t.name
    order by count(*) desc, avg_quality desc
    limit 5
  )
  select jsonb_agg(
    jsonb_build_object(
      'domain', domain,
      'post_count', post_count,
      'score', least(100, (post_count * 10 + avg_quality)::integer)
    )
  ) into domain_data
  from domain_scores;

  -- Update curator score with domains
  update public.curator_scores
  set expertise_domains = coalesce(domain_data, '[]'::jsonb),
      updated_at = now()
  where user_id = target_user_id;
end;
$$ language plpgsql;

-- Trigger to update curator score when posts get views
-- (This would typically be a scheduled job, but for demo purposes...)
create or replace function public.trigger_curator_update()
returns trigger as $$
begin
  -- When a post reaches certain view milestones, update curators who upvoted it early
  if new.total_views in (500, 1000, 5000, 10000) then
    -- Update all curators who upvoted this post
    perform public.update_curator_score(user_id)
    from public.post_upvotes
    where post_id = new.post_id;
  end if;
  return new;
end;
$$ language plpgsql;

-- Note: In production, you'd run curator score updates via a scheduled job
-- rather than triggers, for better performance

-- Function to get top curators (leaderboard)
create or replace function public.get_top_curators(limit_count integer default 10)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  score integer,
  early_upvotes integer,
  expertise_domains jsonb
) as $$
begin
  return query
  select 
    cs.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    cs.score,
    cs.early_upvotes,
    cs.expertise_domains
  from public.curator_scores cs
  join public.profiles p on p.id = cs.user_id
  where cs.score > 50  -- Only show active curators
  order by cs.score desc
  limit limit_count;
end;
$$ language plpgsql;

-- Function to get "rising" posts (high early engagement relative to views)
create or replace function public.get_rising_posts(limit_count integer default 10)
returns table (
  post_id uuid,
  title text,
  slug text,
  author_username text,
  author_display_name text,
  total_views integer,
  upvote_count bigint,
  engagement_ratio float,
  published_at timestamp with time zone
) as $$
begin
  return query
  select 
    p.id as post_id,
    p.title,
    p.slug,
    pr.username as author_username,
    pr.display_name as author_display_name,
    coalesce(ps.total_views, 0) as total_views,
    count(pu.id) as upvote_count,
    case 
      when coalesce(ps.total_views, 0) = 0 then 0
      else count(pu.id)::float / ps.total_views
    end as engagement_ratio,
    p.published_at
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  left join public.post_stats ps on ps.post_id = p.id
  left join public.post_upvotes pu on pu.post_id = p.id
  where p.status = 'published'
    and p.published_at > now() - interval '7 days'  -- Last 7 days
  group by p.id, p.title, p.slug, pr.username, pr.display_name, ps.total_views, p.published_at
  having count(pu.id) > 0  -- At least one upvote
  order by 
    case 
      when coalesce(ps.total_views, 0) < 100 then count(pu.id)::float * 10  -- Boost early posts
      else count(pu.id)::float / greatest(ps.total_views, 1)
    end desc
  limit limit_count;
end;
$$ language plpgsql;

-- =============================================
-- BOOST MARKETPLACE
-- Creator-to-creator promotion system
-- =============================================

-- Boost campaigns - creators set up campaigns to promote their posts
create table public.boost_campaigns (
  id uuid default uuid_generate_v4() primary key,
  
  -- Who is boosting
  advertiser_id uuid references public.profiles(id) on delete cascade not null,
  
  -- What they're boosting
  post_id uuid references public.posts(id) on delete cascade not null,
  
  -- Campaign settings
  name text not null,
  objective text default 'subscribers' check (objective in ('subscribers', 'reads', 'clicks')),
  
  -- Budget
  daily_budget_cents integer not null, -- in cents
  total_budget_cents integer not null,
  spent_cents integer default 0,
  
  -- Bidding
  bid_per_action_cents integer not null, -- CPA bid (cost per subscriber, read, or click)
  
  -- Targeting
  target_topics text[], -- e.g., ['ai', 'writing', 'tech']
  
  -- Status
  status text default 'draft' check (status in ('draft', 'active', 'paused', 'completed', 'exhausted')),
  
  -- Stats
  impressions integer default 0,
  clicks integer default 0,
  conversions integer default 0, -- subscribers, qualified reads, etc based on objective
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Boost placements - where boosts can appear
create table public.boost_placements (
  id uuid default uuid_generate_v4() primary key,
  
  -- Publisher offering inventory
  publisher_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Placement type
  placement_type text not null check (placement_type in (
    'feed_slot',      -- In the reader's feed
    'end_of_post',    -- After a post
    'newsletter',     -- In email newsletter
    'recommended'     -- Recommended posts section
  )),
  
  -- Settings
  is_active boolean default true,
  min_bid_cents integer default 50, -- Minimum bid they'll accept
  
  -- Revenue share (publisher gets this %, platform gets rest)
  revenue_share_percent integer default 70,
  
  -- Restrictions
  blocked_topics text[], -- Topics they won't promote
  blocked_advertisers uuid[], -- Specific advertisers they've blocked
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Boost impressions - track every time a boost is shown
create table public.boost_impressions (
  id uuid default uuid_generate_v4() primary key,
  
  campaign_id uuid references public.boost_campaigns(id) on delete cascade not null,
  placement_id uuid references public.boost_placements(id) on delete set null,
  
  -- Context
  viewer_id uuid references public.profiles(id) on delete set null, -- null = anonymous
  session_id text,
  
  -- What happened
  shown_at timestamp with time zone default timezone('utc'::text, now()) not null,
  clicked boolean default false,
  clicked_at timestamp with time zone,
  converted boolean default false,
  converted_at timestamp with time zone,
  
  -- Cost (only charged on conversion or click, depending on objective)
  cost_cents integer default 0,
  publisher_earnings_cents integer default 0
);

-- Boost wallet - creator balance for running campaigns
create table public.boost_wallets (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  
  balance_cents integer default 0, -- Available to spend
  pending_cents integer default 0, -- Reserved for active campaigns
  earned_cents integer default 0, -- Total earned from placements (lifetime)
  
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Boost transactions - money in/out
create table public.boost_transactions (
  id uuid default uuid_generate_v4() primary key,
  
  user_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Transaction type
  type text not null check (type in (
    'deposit',        -- Added funds
    'campaign_spend', -- Spent on a campaign
    'placement_earn', -- Earned from hosting a placement
    'withdrawal',     -- Withdrew to bank
    'refund'          -- Campaign cancelled, funds returned
  )),
  
  amount_cents integer not null, -- Positive = credit, negative = debit
  
  -- References
  campaign_id uuid references public.boost_campaigns(id) on delete set null,
  impression_id uuid references public.boost_impressions(id) on delete set null,
  
  description text,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- =============================================
-- REFERRAL SYSTEM
-- Creator-to-creator subscriber referrals
-- =============================================

-- Referral programs - creators set up bounties for new subscribers
create table public.referral_programs (
  id uuid default uuid_generate_v4() primary key,
  
  -- Who is offering the bounty
  creator_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Bounty settings
  bounty_cents integer not null, -- Cost per subscriber
  
  -- Budget
  monthly_budget_cents integer, -- null = unlimited
  spent_this_month_cents integer default 0,
  
  -- Targeting
  target_minimum_curator_score integer default 0, -- Only accept referrals from quality curators
  
  -- Status
  is_active boolean default true,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Referral links - track who referred whom
create table public.referral_links (
  id uuid default uuid_generate_v4() primary key,
  
  -- The referrer
  referrer_id uuid references public.profiles(id) on delete cascade not null,
  
  -- The program they're promoting
  program_id uuid references public.referral_programs(id) on delete cascade not null,
  
  -- Unique code for this referrer-program combo
  code text unique not null,
  
  -- Stats
  clicks integer default 0,
  signups integer default 0,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_referrer_program unique (referrer_id, program_id)
);

-- Referral conversions - when someone signs up via referral
create table public.referral_conversions (
  id uuid default uuid_generate_v4() primary key,
  
  link_id uuid references public.referral_links(id) on delete set null not null,
  
  -- The new subscriber
  subscriber_id uuid references public.profiles(id) on delete set null,
  
  -- Payout
  bounty_cents integer not null,
  paid boolean default false,
  paid_at timestamp with time zone,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes for boost/referral queries
create index boost_campaigns_advertiser_idx on public.boost_campaigns(advertiser_id);
create index boost_campaigns_status_idx on public.boost_campaigns(status);
create index boost_placements_publisher_idx on public.boost_placements(publisher_id);
create index boost_impressions_campaign_idx on public.boost_impressions(campaign_id);
create index boost_impressions_shown_at_idx on public.boost_impressions(shown_at);
create index referral_links_code_idx on public.referral_links(code);
create index referral_conversions_link_idx on public.referral_conversions(link_id);

-- RLS for boost/referral tables
alter table public.boost_campaigns enable row level security;
alter table public.boost_placements enable row level security;
alter table public.boost_impressions enable row level security;
alter table public.boost_wallets enable row level security;
alter table public.boost_transactions enable row level security;
alter table public.referral_programs enable row level security;
alter table public.referral_links enable row level security;
alter table public.referral_conversions enable row level security;

-- Boost campaigns: advertiser can manage, others can view active
create policy "Advertisers can manage own campaigns"
  on public.boost_campaigns for all
  using (auth.uid() = advertiser_id);

create policy "Active campaigns are viewable"
  on public.boost_campaigns for select
  using (status = 'active');

-- Boost placements: publishers can manage, others can view active
create policy "Publishers can manage own placements"
  on public.boost_placements for all
  using (auth.uid() = publisher_id);

create policy "Active placements are viewable"
  on public.boost_placements for select
  using (is_active = true);

-- Boost wallets: users can only see own
create policy "Users can view own wallet"
  on public.boost_wallets for select
  using (auth.uid() = user_id);

-- Boost transactions: users can only see own
create policy "Users can view own transactions"
  on public.boost_transactions for select
  using (auth.uid() = user_id);

-- Referral programs: creator can manage, active are public
create policy "Creators can manage own programs"
  on public.referral_programs for all
  using (auth.uid() = creator_id);

create policy "Active programs are viewable"
  on public.referral_programs for select
  using (is_active = true);

-- Referral links: referrers can manage own
create policy "Referrers can manage own links"
  on public.referral_links for all
  using (auth.uid() = referrer_id);

-- Add foreign key for subscriptions.referral_link_id now that referral_links exists
alter table public.subscriptions 
  add constraint subscriptions_referral_link_fkey 
  foreign key (referral_link_id) references public.referral_links(id) on delete set null;

-- Function to match boost campaigns with placements
create or replace function public.get_boost_matches(
  viewer_topics text[],
  placement_type_filter text,
  limit_count integer default 5
)
returns table (
  campaign_id uuid,
  post_id uuid,
  post_title text,
  post_slug text,
  author_username text,
  author_display_name text,
  bid_cents integer
) as $$
begin
  return query
  select 
    bc.id as campaign_id,
    bc.post_id,
    p.title as post_title,
    p.slug as post_slug,
    pr.username as author_username,
    pr.display_name as author_display_name,
    bc.bid_per_action_cents as bid_cents
  from public.boost_campaigns bc
  join public.posts p on p.id = bc.post_id
  join public.profiles pr on pr.id = bc.advertiser_id
  where bc.status = 'active'
    and bc.spent_cents < bc.total_budget_cents
    and (bc.target_topics is null or bc.target_topics && viewer_topics)
  order by bc.bid_per_action_cents desc, random()
  limit limit_count;
end;
$$ language plpgsql;

-- Function to reserve funds for a campaign
create or replace function public.reserve_boost_funds(
  p_user_id uuid,
  p_amount_cents integer,
  p_campaign_id uuid
)
returns boolean as $$
declare
  current_balance integer;
begin
  -- Get current balance
  select balance_cents into current_balance
  from public.boost_wallets
  where user_id = p_user_id
  for update;

  -- Check if enough balance
  if current_balance is null or current_balance < p_amount_cents then
    return false;
  end if;

  -- Update wallet: move from balance to pending
  update public.boost_wallets
  set 
    balance_cents = balance_cents - p_amount_cents,
    pending_cents = pending_cents + p_amount_cents,
    updated_at = now()
  where user_id = p_user_id;

  -- Log transaction
  insert into public.boost_transactions (user_id, type, amount_cents, campaign_id, description)
  values (p_user_id, 'campaign_spend', -p_amount_cents, p_campaign_id, 'Reserved for campaign');

  return true;
end;
$$ language plpgsql security definer;

-- Function to release reserved funds (when campaign ends)
create or replace function public.release_boost_funds(
  p_user_id uuid,
  p_amount_cents integer,
  p_campaign_id uuid
)
returns boolean as $$
begin
  -- Move unspent funds back from pending to balance
  update public.boost_wallets
  set 
    balance_cents = balance_cents + p_amount_cents,
    pending_cents = pending_cents - p_amount_cents,
    updated_at = now()
  where user_id = p_user_id;

  -- Log transaction
  insert into public.boost_transactions (user_id, type, amount_cents, campaign_id, description)
  values (p_user_id, 'refund', p_amount_cents, p_campaign_id, 'Unspent campaign funds returned');

  return true;
end;
$$ language plpgsql security definer;

-- Function to record a boost impression and handle payment
create or replace function public.record_boost_impression(
  p_campaign_id uuid,
  p_placement_id uuid,
  p_viewer_id uuid,
  p_session_id text
)
returns uuid as $$
declare
  impression_id uuid;
begin
  -- Create impression record
  insert into public.boost_impressions (campaign_id, placement_id, viewer_id, session_id)
  values (p_campaign_id, p_placement_id, p_viewer_id, p_session_id)
  returning id into impression_id;

  -- Update campaign stats
  update public.boost_campaigns
  set impressions = impressions + 1
  where id = p_campaign_id;

  return impression_id;
end;
$$ language plpgsql security definer;

-- Function to record a click on a boost
create or replace function public.record_boost_click(
  p_impression_id uuid
)
returns boolean as $$
declare
  v_campaign_id uuid;
  v_placement_id uuid;
  v_objective text;
  v_bid_cents integer;
  v_advertiser_id uuid;
  v_publisher_id uuid;
  v_revenue_share integer;
  v_publisher_earnings integer;
begin
  -- Get impression details
  select campaign_id, placement_id into v_campaign_id, v_placement_id
  from public.boost_impressions
  where id = p_impression_id;

  -- Get campaign details
  select objective, bid_per_action_cents, advertiser_id into v_objective, v_bid_cents, v_advertiser_id
  from public.boost_campaigns
  where id = v_campaign_id;

  -- Update impression
  update public.boost_impressions
  set clicked = true, clicked_at = now()
  where id = p_impression_id;

  -- Update campaign clicks
  update public.boost_campaigns
  set clicks = clicks + 1
  where id = v_campaign_id;

  -- If objective is clicks, charge now
  if v_objective = 'clicks' then
    -- Get placement details for revenue share
    if v_placement_id is not null then
      select publisher_id, revenue_share_percent into v_publisher_id, v_revenue_share
      from public.boost_placements
      where id = v_placement_id;
      
      v_publisher_earnings := (v_bid_cents * v_revenue_share) / 100;
    else
      v_publisher_earnings := 0;
    end if;

    -- Update impression with cost
    update public.boost_impressions
    set 
      cost_cents = v_bid_cents,
      publisher_earnings_cents = v_publisher_earnings,
      converted = true,
      converted_at = now()
    where id = p_impression_id;

    -- Charge advertiser
    update public.boost_campaigns
    set 
      spent_cents = spent_cents + v_bid_cents,
      conversions = conversions + 1
    where id = v_campaign_id;

    update public.boost_wallets
    set pending_cents = pending_cents - v_bid_cents
    where user_id = v_advertiser_id;

    -- Pay publisher
    if v_publisher_id is not null and v_publisher_earnings > 0 then
      update public.boost_wallets
      set 
        earned_cents = earned_cents + v_publisher_earnings,
        balance_cents = balance_cents + v_publisher_earnings
      where user_id = v_publisher_id;

      insert into public.boost_transactions (user_id, type, amount_cents, impression_id, description)
      values (v_publisher_id, 'placement_earn', v_publisher_earnings, p_impression_id, 'Placement earnings');
    end if;

    -- Check if campaign is exhausted
    perform public.check_campaign_budget(v_campaign_id);
  end if;

  return true;
end;
$$ language plpgsql security definer;

-- Function to record a conversion (subscriber or qualified read)
create or replace function public.record_boost_conversion(
  p_impression_id uuid
)
returns boolean as $$
declare
  v_campaign_id uuid;
  v_placement_id uuid;
  v_objective text;
  v_bid_cents integer;
  v_advertiser_id uuid;
  v_publisher_id uuid;
  v_revenue_share integer;
  v_publisher_earnings integer;
  v_already_converted boolean;
begin
  -- Get impression details
  select campaign_id, placement_id, converted into v_campaign_id, v_placement_id, v_already_converted
  from public.boost_impressions
  where id = p_impression_id;

  -- Skip if already converted
  if v_already_converted then
    return false;
  end if;

  -- Get campaign details
  select objective, bid_per_action_cents, advertiser_id into v_objective, v_bid_cents, v_advertiser_id
  from public.boost_campaigns
  where id = v_campaign_id;

  -- Get placement details for revenue share
  if v_placement_id is not null then
    select publisher_id, revenue_share_percent into v_publisher_id, v_revenue_share
    from public.boost_placements
    where id = v_placement_id;
    
    v_publisher_earnings := (v_bid_cents * v_revenue_share) / 100;
  else
    v_publisher_earnings := 0;
  end if;

  -- Update impression with cost
  update public.boost_impressions
  set 
    cost_cents = v_bid_cents,
    publisher_earnings_cents = v_publisher_earnings,
    converted = true,
    converted_at = now()
  where id = p_impression_id;

  -- Charge advertiser
  update public.boost_campaigns
  set 
    spent_cents = spent_cents + v_bid_cents,
    conversions = conversions + 1
  where id = v_campaign_id;

  update public.boost_wallets
  set pending_cents = pending_cents - v_bid_cents
  where user_id = v_advertiser_id;

  -- Pay publisher
  if v_publisher_id is not null and v_publisher_earnings > 0 then
    update public.boost_wallets
    set 
      earned_cents = earned_cents + v_publisher_earnings,
      balance_cents = balance_cents + v_publisher_earnings
    where user_id = v_publisher_id;

    insert into public.boost_transactions (user_id, type, amount_cents, impression_id, description)
    values (v_publisher_id, 'placement_earn', v_publisher_earnings, p_impression_id, 'Placement earnings');
  end if;

  -- Check if campaign is exhausted
  perform public.check_campaign_budget(v_campaign_id);

  return true;
end;
$$ language plpgsql security definer;

-- Function to check if campaign budget is exhausted
create or replace function public.check_campaign_budget(p_campaign_id uuid)
returns void as $$
declare
  v_spent integer;
  v_total integer;
begin
  select spent_cents, total_budget_cents into v_spent, v_total
  from public.boost_campaigns
  where id = p_campaign_id;

  if v_spent >= v_total then
    update public.boost_campaigns
    set status = 'exhausted'
    where id = p_campaign_id;
  end if;
end;
$$ language plpgsql;

-- Function to add funds to wallet (called after Stripe payment)
create or replace function public.add_boost_funds(
  p_user_id uuid,
  p_amount_cents integer,
  p_description text default 'Deposit'
)
returns boolean as $$
begin
  -- Create wallet if doesn't exist
  insert into public.boost_wallets (user_id, balance_cents)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- Add funds
  update public.boost_wallets
  set 
    balance_cents = balance_cents + p_amount_cents,
    updated_at = now()
  where user_id = p_user_id;

  -- Log transaction
  insert into public.boost_transactions (user_id, type, amount_cents, description)
  values (p_user_id, 'deposit', p_amount_cents, p_description);

  return true;
end;
$$ language plpgsql security definer;

-- =============================================
-- SUBSCRIPTION FUNCTIONS
-- =============================================

-- Function to get subscriber count for a creator
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
$$ language plpgsql;

-- Function to check if user is subscribed
create or replace function public.is_subscribed(
  p_subscriber_id uuid,
  p_creator_id uuid
)
returns boolean as $$
begin
  return exists (
    select 1 from public.subscriptions
    where subscriber_id = p_subscriber_id
      and creator_id = p_creator_id
  );
end;
$$ language plpgsql;

-- Function to subscribe (handles referral tracking)
create or replace function public.subscribe_to_creator(
  p_subscriber_id uuid,
  p_creator_id uuid,
  p_referral_code text default null
)
returns uuid as $$
declare
  v_subscription_id uuid;
  v_referral_link_id uuid;
  v_program_id uuid;
  v_bounty_cents integer;
begin
  -- Don't allow self-subscription
  if p_subscriber_id = p_creator_id then
    raise exception 'Cannot subscribe to yourself';
  end if;

  -- Check for referral
  if p_referral_code is not null then
    select id, program_id into v_referral_link_id, v_program_id
    from public.referral_links
    where code = p_referral_code;
    
    if v_referral_link_id is not null then
      -- Update referral link stats
      update public.referral_links
      set signups = signups + 1
      where id = v_referral_link_id;
      
      -- Get bounty and create conversion
      select bounty_cents into v_bounty_cents
      from public.referral_programs
      where id = v_program_id;
      
      if v_bounty_cents is not null then
        insert into public.referral_conversions (link_id, subscriber_id, bounty_cents)
        values (v_referral_link_id, p_subscriber_id, v_bounty_cents);
      end if;
    end if;
  end if;

  -- Create subscription
  insert into public.subscriptions (subscriber_id, creator_id, referral_link_id)
  values (p_subscriber_id, p_creator_id, v_referral_link_id)
  on conflict (subscriber_id, creator_id) do nothing
  returning id into v_subscription_id;
  
  return v_subscription_id;
end;
$$ language plpgsql security definer;

-- Function to unsubscribe
create or replace function public.unsubscribe_from_creator(
  p_subscriber_id uuid,
  p_creator_id uuid
)
returns boolean as $$
begin
  delete from public.subscriptions
  where subscriber_id = p_subscriber_id
    and creator_id = p_creator_id;
  
  return found;
end;
$$ language plpgsql security definer;

-- Function to get feed for a user (posts from subscribed creators)
create or replace function public.get_subscription_feed(
  p_user_id uuid,
  p_limit integer default 20,
  p_offset integer default 0,
  p_content_type text default null
)
returns table (
  post_id uuid,
  title text,
  slug text,
  subtitle text,
  excerpt text,
  cover_image_url text,
  published_at timestamp with time zone,
  reading_time_minutes integer,
  content_type text,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text
) as $$
begin
  return query
  select 
    p.id as post_id,
    p.title,
    p.slug,
    p.subtitle,
    p.excerpt,
    p.cover_image_url,
    p.published_at,
    p.reading_time_minutes,
    p.content_type,
    pr.id as author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.subscriptions s on s.creator_id = p.author_id
  where s.subscriber_id = p_user_id
    and p.status = 'published'
    and (p_content_type is null or p.content_type = p_content_type)
  order by p.published_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql;

-- RLS policies for subscriptions
create policy "Users can see own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = subscriber_id or auth.uid() = creator_id);

create policy "Users can subscribe"
  on public.subscriptions for insert
  with check (auth.uid() = subscriber_id);

create policy "Users can unsubscribe"
  on public.subscriptions for delete
  using (auth.uid() = subscriber_id);

-- RLS policies for email subscribers (only creator can access)
create policy "Creators can view their email subscribers"
  on public.email_subscribers for select
  using (auth.uid() = creator_id);

create policy "Creators can manage their email subscribers"
  on public.email_subscribers for all
  using (auth.uid() = creator_id);

create policy "Creators can view subscriber notes"
  on public.subscriber_notes for select
  using (auth.uid() = creator_id);

create policy "Creators can manage subscriber notes"
  on public.subscriber_notes for all
  using (auth.uid() = creator_id);

create policy "Creators can view subscriber tags"
  on public.subscriber_tags for select
  using (auth.uid() = creator_id);

create policy "Creators can manage subscriber tags"
  on public.subscriber_tags for all
  using (auth.uid() = creator_id);

-- =============================================
-- STORAGE CONFIGURATION
-- Run this in Supabase Dashboard > Storage
-- =============================================
-- 
-- 1. Create a bucket called "images" with public access
-- 
-- 2. Add these storage policies:
--
-- Policy: "Allow authenticated uploads"
-- Allowed operation: INSERT
-- Policy definition: (auth.role() = 'authenticated')
-- 
-- Policy: "Allow public reads"
-- Allowed operation: SELECT  
-- Policy definition: true
--
-- Policy: "Allow users to delete own images"
-- Allowed operation: DELETE
-- Policy definition: (auth.uid()::text = (storage.foldername(name))[1])

-- =============================================
-- COMMENTS
-- Threaded discussions on posts
-- =============================================

create table public.comments (
  id uuid default uuid_generate_v4() primary key,
  
  -- What this comment is on
  post_id uuid references public.posts(id) on delete cascade not null,
  
  -- Who wrote it
  author_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Threading
  parent_id uuid references public.comments(id) on delete cascade,
  depth integer default 0,
  
  -- Content
  content text not null,
  
  -- Moderation
  status text default 'visible' check (status in ('visible', 'hidden', 'deleted')),
  
  -- Engagement
  upvote_count integer default 0,
  reply_count integer default 0,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Comment upvotes
create table public.comment_upvotes (
  id uuid default uuid_generate_v4() primary key,
  comment_id uuid references public.comments(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_comment_upvote unique (comment_id, user_id)
);

-- Indexes
create index comments_post_idx on public.comments(post_id);
create index comments_author_idx on public.comments(author_id);
create index comments_parent_idx on public.comments(parent_id);
create index comment_upvotes_comment_idx on public.comment_upvotes(comment_id);
create index comment_upvotes_user_idx on public.comment_upvotes(user_id);

-- RLS
alter table public.comments enable row level security;
alter table public.comment_upvotes enable row level security;

-- Comments: public read, authenticated write
create policy "Comments are viewable by everyone"
  on public.comments for select
  using (status = 'visible');

create policy "Authenticated users can create comments"
  on public.comments for insert
  with check (auth.uid() = author_id);

create policy "Users can update own comments"
  on public.comments for update
  using (auth.uid() = author_id);

create policy "Users can delete own comments"
  on public.comments for delete
  using (auth.uid() = author_id);

-- Comment upvotes
create policy "Comment upvotes are viewable"
  on public.comment_upvotes for select
  using (true);

create policy "Authenticated users can upvote"
  on public.comment_upvotes for insert
  with check (auth.uid() = user_id);

create policy "Users can remove own upvotes"
  on public.comment_upvotes for delete
  using (auth.uid() = user_id);

-- Function to add a comment
create or replace function public.add_comment(
  p_post_id uuid,
  p_author_id uuid,
  p_content text,
  p_parent_id uuid default null
)
returns uuid as $$
declare
  v_comment_id uuid;
  v_depth integer := 0;
begin
  -- Get parent depth if replying
  if p_parent_id is not null then
    select depth + 1 into v_depth
    from public.comments
    where id = p_parent_id;
    
    -- Update parent reply count
    update public.comments
    set reply_count = reply_count + 1
    where id = p_parent_id;
  end if;
  
  -- Insert comment
  insert into public.comments (post_id, author_id, parent_id, content, depth)
  values (p_post_id, p_author_id, p_parent_id, p_content, v_depth)
  returning id into v_comment_id;
  
  return v_comment_id;
end;
$$ language plpgsql security definer;

-- Function to upvote a comment
create or replace function public.toggle_comment_upvote(
  p_comment_id uuid,
  p_user_id uuid
)
returns boolean as $$
declare
  v_exists boolean;
begin
  -- Check if upvote exists
  select exists(
    select 1 from public.comment_upvotes
    where comment_id = p_comment_id and user_id = p_user_id
  ) into v_exists;
  
  if v_exists then
    -- Remove upvote
    delete from public.comment_upvotes
    where comment_id = p_comment_id and user_id = p_user_id;
    
    update public.comments
    set upvote_count = upvote_count - 1
    where id = p_comment_id;
    
    return false;
  else
    -- Add upvote
    insert into public.comment_upvotes (comment_id, user_id)
    values (p_comment_id, p_user_id);
    
    update public.comments
    set upvote_count = upvote_count + 1
    where id = p_comment_id;
    
    return true;
  end if;
end;
$$ language plpgsql security definer;

-- Function to get comments for a post (threaded)
create or replace function public.get_post_comments(p_post_id uuid)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  parent_id uuid,
  depth integer,
  content text,
  upvote_count integer,
  reply_count integer,
  created_at timestamp with time zone,
  author_username text,
  author_display_name text,
  author_avatar_url text
) as $$
begin
  return query
  select 
    c.id,
    c.post_id,
    c.author_id,
    c.parent_id,
    c.depth,
    c.content,
    c.upvote_count,
    c.reply_count,
    c.created_at,
    p.username as author_username,
    p.display_name as author_display_name,
    p.avatar_url as author_avatar_url
  from public.comments c
  join public.profiles p on p.id = c.author_id
  where c.post_id = p_post_id
    and c.status = 'visible'
  order by c.created_at asc;
end;
$$ language plpgsql;

-- =============================================
-- NOTIFICATIONS
-- In-app notification inbox
-- =============================================

create table public.notifications (
  id uuid default uuid_generate_v4() primary key,
  
  -- Who receives this notification
  user_id uuid references public.profiles(id) on delete cascade not null,
  
  -- Notification type
  type text not null check (type in (
    'new_subscriber',
    'new_comment', 
    'comment_reply',
    'comment_upvote',
    'post_upvote',
    'post_forked',
    'referral_conversion',
    'boost_exhausted'
  )),
  
  -- Related entities
  actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  
  -- Content
  title text not null,
  body text,
  url text,
  
  -- Status
  read boolean default false,
  read_at timestamp with time zone,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index notifications_user_idx on public.notifications(user_id);
create index notifications_user_unread_idx on public.notifications(user_id) where read = false;
create index notifications_created_idx on public.notifications(created_at desc);

-- RLS
alter table public.notifications enable row level security;

create policy "Users can see own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);

-- Function to create notification
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_url text default null,
  p_actor_id uuid default null,
  p_post_id uuid default null,
  p_comment_id uuid default null
)
returns uuid as $$
declare
  v_notification_id uuid;
begin
  -- Don't notify yourself
  if p_actor_id = p_user_id then
    return null;
  end if;
  
  insert into public.notifications (
    user_id, type, title, body, url, actor_id, post_id, comment_id
  )
  values (
    p_user_id, p_type, p_title, p_body, p_url, p_actor_id, p_post_id, p_comment_id
  )
  returning id into v_notification_id;
  
  return v_notification_id;
end;
$$ language plpgsql security definer;

-- Function to mark notifications as read
create or replace function public.mark_notifications_read(p_user_id uuid)
returns integer as $$
declare
  v_count integer;
begin
  update public.notifications
  set read = true, read_at = now()
  where user_id = p_user_id and read = false;
  
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

-- Function to get unread count
create or replace function public.get_unread_notification_count(p_user_id uuid)
returns integer as $$
begin
  return (
    select count(*)::integer
    from public.notifications
    where user_id = p_user_id and read = false
  );
end;
$$ language plpgsql;

-- =============================================
-- NOTIFICATION TRIGGERS
-- Auto-generate notifications for key events
-- =============================================

-- Trigger: New subscriber notification
create or replace function public.notify_new_subscriber()
returns trigger as $$
declare
  v_subscriber_name text;
begin
  -- Get subscriber name
  select coalesce(display_name, username) into v_subscriber_name
  from public.profiles
  where id = NEW.subscriber_id;
  
  -- Create notification for creator
  perform public.create_notification(
    p_user_id := NEW.creator_id,
    p_type := 'new_subscriber',
    p_title := v_subscriber_name || ' subscribed to you',
    p_actor_id := NEW.subscriber_id
  );
  
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_new_subscription
  after insert on public.subscriptions
  for each row execute function public.notify_new_subscriber();

-- Trigger: New comment notification
create or replace function public.notify_new_comment()
returns trigger as $$
declare
  v_commenter_name text;
  v_post_author_id uuid;
  v_post_title text;
  v_post_slug text;
  v_author_username text;
  v_parent_author_id uuid;
begin
  -- Get commenter name
  select coalesce(display_name, username) into v_commenter_name
  from public.profiles
  where id = NEW.author_id;
  
  -- Get post info
  select p.author_id, p.title, p.slug, pr.username 
  into v_post_author_id, v_post_title, v_post_slug, v_author_username
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.id = NEW.post_id;
  
  -- If this is a reply, notify the parent comment author
  if NEW.parent_id is not null then
    select author_id into v_parent_author_id
    from public.comments
    where id = NEW.parent_id;
    
    if v_parent_author_id is not null and v_parent_author_id != NEW.author_id then
      perform public.create_notification(
        p_user_id := v_parent_author_id,
        p_type := 'comment_reply',
        p_title := v_commenter_name || ' replied to your comment',
        p_body := left(NEW.content, 100),
        p_url := '/' || v_author_username || '/' || v_post_slug || '#comment-' || NEW.id,
        p_actor_id := NEW.author_id,
        p_post_id := NEW.post_id,
        p_comment_id := NEW.id
      );
    end if;
  end if;
  
  -- Always notify post author (unless they're the commenter or the parent author)
  if v_post_author_id != NEW.author_id and v_post_author_id != v_parent_author_id then
    perform public.create_notification(
      p_user_id := v_post_author_id,
      p_type := 'new_comment',
      p_title := v_commenter_name || ' commented on "' || left(v_post_title, 30) || '"',
      p_body := left(NEW.content, 100),
      p_url := '/' || v_author_username || '/' || v_post_slug || '#comment-' || NEW.id,
      p_actor_id := NEW.author_id,
      p_post_id := NEW.post_id,
      p_comment_id := NEW.id
    );
  end if;
  
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_new_comment
  after insert on public.comments
  for each row execute function public.notify_new_comment();

-- Trigger: Post upvote notification
create or replace function public.notify_post_upvote()
returns trigger as $$
declare
  v_voter_name text;
  v_post_author_id uuid;
  v_post_title text;
begin
  -- Get voter name
  select coalesce(display_name, username) into v_voter_name
  from public.profiles
  where id = NEW.user_id;
  
  -- Get post info
  select author_id, title into v_post_author_id, v_post_title
  from public.posts
  where id = NEW.post_id;
  
  -- Create notification
  perform public.create_notification(
    p_user_id := v_post_author_id,
    p_type := 'post_upvote',
    p_title := v_voter_name || ' upvoted "' || left(v_post_title, 30) || '"',
    p_actor_id := NEW.user_id,
    p_post_id := NEW.post_id
  );
  
  return NEW;
end;
$$ language plpgsql security definer;

create trigger on_post_upvote
  after insert on public.post_upvotes
  for each row execute function public.notify_post_upvote();

-- Trigger: Post forked notification
create or replace function public.notify_post_forked()
returns trigger as $$
declare
  v_forker_name text;
  v_forker_username text;
  v_original_author_id uuid;
  v_original_title text;
begin
  -- Only for forks
  if NEW.forked_from_id is null then
    return NEW;
  end if;
  
  -- Get forker info
  select coalesce(display_name, username), username into v_forker_name, v_forker_username
  from public.profiles
  where id = NEW.author_id;
  
  -- Get original post info
  select author_id, title into v_original_author_id, v_original_title
  from public.posts
  where id = NEW.forked_from_id;
  
  -- Create notification
  perform public.create_notification(
    p_user_id := v_original_author_id,
    p_type := 'post_forked',
    p_title := v_forker_name || ' forked "' || left(v_original_title, 30) || '"',
    p_url := '/' || v_forker_username || '/' || NEW.slug,
    p_actor_id := NEW.author_id,
    p_post_id := NEW.id
  );
  
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger created earlier in file

-- =============================================
-- SEARCH
-- Full-text search for posts and users
-- =============================================

-- Add search vectors to posts
alter table public.posts add column if not exists search_vector tsvector;

-- Create index for search
create index if not exists posts_search_idx on public.posts using gin(search_vector);

-- Function to update search vector
create or replace function public.update_post_search_vector()
returns trigger as $$
begin
  NEW.search_vector := 
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.subtitle, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.excerpt, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(
      regexp_replace(NEW.content, '<[^>]*>', ' ', 'g'), ''
    )), 'D');
  return NEW;
end;
$$ language plpgsql;

-- Trigger to update search vector on insert/update
create trigger posts_search_vector_trigger
  before insert or update of title, subtitle, excerpt, content
  on public.posts
  for each row execute function public.update_post_search_vector();

-- Function to search posts
create or replace function public.search_posts(
  p_query text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  slug text,
  excerpt text,
  cover_image_url text,
  published_at timestamp with time zone,
  reading_time_minutes integer,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  rank real
) as $$
begin
  return query
  select 
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    p.cover_image_url,
    p.published_at,
    p.reading_time_minutes,
    pr.id as author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url,
    ts_rank(p.search_vector, websearch_to_tsquery('english', p_query)) as rank
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  where p.status = 'published'
    and p.search_vector @@ websearch_to_tsquery('english', p_query)
  order by rank desc, p.published_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql;

-- Function to search users
create or replace function public.search_users(
  p_query text,
  p_limit integer default 20
)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  post_count bigint
) as $$
begin
  return query
  select 
    pr.id,
    pr.username,
    pr.display_name,
    pr.bio,
    pr.avatar_url,
    (select count(*) from public.posts where author_id = pr.id and status = 'published') as post_count
  from public.profiles pr
  where 
    pr.username ilike '%' || p_query || '%'
    or pr.display_name ilike '%' || p_query || '%'
    or pr.bio ilike '%' || p_query || '%'
  order by 
    case when pr.username ilike p_query || '%' then 0
         when pr.display_name ilike p_query || '%' then 1
         else 2 end,
    post_count desc
  limit p_limit;
end;
$$ language plpgsql;

-- =============================================
-- BOOKMARKS / SAVES
-- Users can save posts for later
-- =============================================

create table public.bookmarks (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_bookmark unique (user_id, post_id)
);

-- Indexes
create index bookmarks_user_idx on public.bookmarks(user_id);
create index bookmarks_post_idx on public.bookmarks(post_id);

-- RLS
alter table public.bookmarks enable row level security;

create policy "Users can see own bookmarks"
  on public.bookmarks for select
  using (auth.uid() = user_id);

create policy "Users can create bookmarks"
  on public.bookmarks for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own bookmarks"
  on public.bookmarks for delete
  using (auth.uid() = user_id);

-- Function to toggle bookmark
create or replace function public.toggle_bookmark(
  p_user_id uuid,
  p_post_id uuid
)
returns boolean as $$
declare
  v_exists boolean;
begin
  select exists(
    select 1 from public.bookmarks
    where user_id = p_user_id and post_id = p_post_id
  ) into v_exists;
  
  if v_exists then
    delete from public.bookmarks
    where user_id = p_user_id and post_id = p_post_id;
    return false;
  else
    insert into public.bookmarks (user_id, post_id)
    values (p_user_id, p_post_id);
    return true;
  end if;
end;
$$ language plpgsql security definer;

-- Function to get user's bookmarks
create or replace function public.get_user_bookmarks(
  p_user_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  bookmark_id uuid,
  bookmarked_at timestamp with time zone,
  post_id uuid,
  title text,
  slug text,
  excerpt text,
  cover_image_url text,
  published_at timestamp with time zone,
  reading_time_minutes integer,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text
) as $$
begin
  return query
  select 
    b.id as bookmark_id,
    b.created_at as bookmarked_at,
    p.id as post_id,
    p.title,
    p.slug,
    p.excerpt,
    p.cover_image_url,
    p.published_at,
    p.reading_time_minutes,
    pr.id as author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url
  from public.bookmarks b
  join public.posts p on p.id = b.post_id
  join public.profiles pr on pr.id = p.author_id
  where b.user_id = p_user_id
    and p.status = 'published'
  order by b.created_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql;

-- =============================================
-- TAGS / TOPICS (tables created earlier, just adding user_interests)
-- =============================================

-- User interests (for recommendations)
create table public.user_interests (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  tag_id uuid references public.tags(id) on delete cascade not null,
  weight real default 1.0, -- higher = more interested
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_user_interest unique (user_id, tag_id)
);

-- Indexes
create index post_tags_post_idx on public.post_tags(post_id);
create index post_tags_tag_idx on public.post_tags(tag_id);
create index user_interests_user_idx on public.user_interests(user_id);
create index tags_slug_idx on public.tags(slug);

-- RLS for user_interests only (tags and post_tags RLS defined earlier)
alter table public.user_interests enable row level security;

-- Users can manage own interests
create policy "Users can manage own interests"
  on public.user_interests for all
  using (auth.uid() = user_id);

-- Function to add tags to a post
create or replace function public.set_post_tags(
  p_post_id uuid,
  p_tag_names text[]
)
returns void as $$
declare
  v_tag_id uuid;
  v_tag_name text;
begin
  -- Remove existing tags
  delete from public.post_tags where post_id = p_post_id;
  
  -- Add new tags
  foreach v_tag_name in array p_tag_names
  loop
    -- Get or create tag
    insert into public.tags (name, slug)
    values (v_tag_name, lower(regexp_replace(v_tag_name, '[^a-zA-Z0-9]+', '-', 'g')))
    on conflict (name) do update set name = excluded.name
    returning id into v_tag_id;
    
    -- Link to post
    insert into public.post_tags (post_id, tag_id)
    values (p_post_id, v_tag_id)
    on conflict do nothing;
  end loop;
  
  -- Update tag counts
  update public.tags t
  set post_count = (
    select count(*) from public.post_tags pt
    join public.posts p on p.id = pt.post_id
    where pt.tag_id = t.id and p.status = 'published'
  );
end;
$$ language plpgsql security definer;

-- Function to get posts by tag
create or replace function public.get_posts_by_tag(
  p_tag_slug text,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  slug text,
  excerpt text,
  cover_image_url text,
  published_at timestamp with time zone,
  reading_time_minutes integer,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text
) as $$
begin
  return query
  select 
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    p.cover_image_url,
    p.published_at,
    p.reading_time_minutes,
    pr.id as author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.post_tags pt on pt.post_id = p.id
  join public.tags t on t.id = pt.tag_id
  where t.slug = p_tag_slug
    and p.status = 'published'
  order by p.published_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql;

-- Seed some common tags
insert into public.tags (name, slug, color) values
  ('Technology', 'technology', '#3b82f6'),
  ('AI', 'ai', '#8b5cf6'),
  ('Writing', 'writing', '#ec4899'),
  ('Business', 'business', '#10b981'),
  ('Startups', 'startups', '#f59e0b'),
  ('Science', 'science', '#06b6d4'),
  ('Health', 'health', '#22c55e'),
  ('Finance', 'finance', '#14b8a6'),
  ('Design', 'design', '#f43f5e'),
  ('Programming', 'programming', '#6366f1'),
  ('Productivity', 'productivity', '#84cc16'),
  ('Culture', 'culture', '#a855f7'),
  ('Politics', 'politics', '#ef4444'),
  ('Philosophy', 'philosophy', '#64748b'),
  ('Personal', 'personal', '#f97316')
on conflict (name) do nothing;

-- =============================================
-- READING HISTORY
-- Track what users have read for personalization
-- =============================================

create table public.reading_history (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade not null,
  
  -- Reading progress
  progress real default 0, -- 0 to 1 (percentage scrolled)
  completed boolean default false,
  time_spent_seconds integer default 0,
  
  -- Timestamps
  first_read_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_read_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_reading_history unique (user_id, post_id)
);

-- Indexes
create index reading_history_user_idx on public.reading_history(user_id);
create index reading_history_last_read_idx on public.reading_history(last_read_at desc);
create index reading_history_incomplete_idx on public.reading_history(user_id) where completed = false and progress > 0;

-- RLS
alter table public.reading_history enable row level security;

create policy "Users can manage own reading history"
  on public.reading_history for all
  using (auth.uid() = user_id);

-- Function to update reading progress
create or replace function public.update_reading_progress(
  p_user_id uuid,
  p_post_id uuid,
  p_progress real,
  p_time_spent integer default 0
)
returns void as $$
begin
  insert into public.reading_history (user_id, post_id, progress, time_spent_seconds, completed)
  values (
    p_user_id, 
    p_post_id, 
    p_progress, 
    p_time_spent,
    p_progress >= 0.9
  )
  on conflict (user_id, post_id) do update set
    progress = greatest(reading_history.progress, excluded.progress),
    time_spent_seconds = reading_history.time_spent_seconds + excluded.time_spent_seconds,
    completed = reading_history.completed or excluded.completed,
    last_read_at = now();
end;
$$ language plpgsql security definer;

-- Function to get continue reading posts
create or replace function public.get_continue_reading(
  p_user_id uuid,
  p_limit integer default 5
)
returns table (
  post_id uuid,
  progress real,
  last_read_at timestamp with time zone,
  title text,
  slug text,
  excerpt text,
  cover_image_url text,
  reading_time_minutes integer,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text
) as $$
begin
  return query
  select 
    rh.post_id,
    rh.progress,
    rh.last_read_at,
    p.title,
    p.slug,
    p.excerpt,
    p.cover_image_url,
    p.reading_time_minutes,
    pr.id as author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url
  from public.reading_history rh
  join public.posts p on p.id = rh.post_id
  join public.profiles pr on pr.id = p.author_id
  where rh.user_id = p_user_id
    and rh.completed = false
    and rh.progress > 0.05
    and rh.progress < 0.9
    and p.status = 'published'
  order by rh.last_read_at desc
  limit p_limit;
end;
$$ language plpgsql;

-- Function to get reading history
create or replace function public.get_reading_history(
  p_user_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  post_id uuid,
  progress real,
  completed boolean,
  time_spent_seconds integer,
  last_read_at timestamp with time zone,
  title text,
  slug text,
  excerpt text,
  cover_image_url text,
  reading_time_minutes integer,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text
) as $$
begin
  return query
  select 
    rh.post_id,
    rh.progress,
    rh.completed,
    rh.time_spent_seconds,
    rh.last_read_at,
    p.title,
    p.slug,
    p.excerpt,
    p.cover_image_url,
    p.reading_time_minutes,
    pr.id as author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url
  from public.reading_history rh
  join public.posts p on p.id = rh.post_id
  join public.profiles pr on pr.id = p.author_id
  where rh.user_id = p_user_id
    and p.status = 'published'
  order by rh.last_read_at desc
  limit p_limit
  offset p_offset;
end;
$$ language plpgsql;

-- Function to get related posts based on shared tags
create or replace function public.get_related_posts(
  p_post_id uuid,
  p_limit integer default 3
)
returns table (
  id uuid,
  title text,
  slug text,
  excerpt text,
  cover_image_url text,
  published_at timestamp with time zone,
  reading_time_minutes integer,
  author_id uuid,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  shared_tags integer
) as $$
begin
  return query
  select 
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    p.cover_image_url,
    p.published_at,
    p.reading_time_minutes,
    pr.id as author_id,
    pr.username as author_username,
    pr.display_name as author_display_name,
    pr.avatar_url as author_avatar_url,
    count(pt2.tag_id)::integer as shared_tags
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.post_tags pt2 on pt2.post_id = p.id
  where p.id != p_post_id
    and p.status = 'published'
    and pt2.tag_id in (
      select tag_id from public.post_tags where post_id = p_post_id
    )
  group by p.id, pr.id
  order by shared_tags desc, p.published_at desc
  limit p_limit;
end;
$$ language plpgsql;

-- =============================================
-- POST SCHEDULING
-- =============================================
alter table public.posts add column if not exists scheduled_at timestamp with time zone;
create index if not exists posts_scheduled_idx on public.posts(scheduled_at) where status = 'scheduled';

-- =============================================
-- READING LISTS / COLLECTIONS
-- =============================================
create table if not exists public.reading_lists (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  description text,
  is_public boolean default false,
  post_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.reading_list_items (
  id uuid default uuid_generate_v4() primary key,
  list_id uuid references public.reading_lists(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete cascade not null,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_list_item unique (list_id, post_id)
);

alter table public.reading_lists enable row level security;
alter table public.reading_list_items enable row level security;

create policy "Users can manage own lists" on public.reading_lists for all using (auth.uid() = user_id);
create policy "Public lists are viewable" on public.reading_lists for select using (is_public = true);
create policy "List owners can manage items" on public.reading_list_items for all 
  using (exists (select 1 from public.reading_lists where id = list_id and user_id = auth.uid()));
create policy "Public list items viewable" on public.reading_list_items for select
  using (exists (select 1 from public.reading_lists where id = list_id and is_public = true));

-- =============================================
-- PINNED POSTS
-- =============================================
alter table public.posts add column if not exists is_pinned boolean default false;

-- =============================================
-- FEATURED AUTHORS (admin curated)
-- =============================================
alter table public.profiles add column if not exists is_featured boolean default false;
alter table public.profiles add column if not exists featured_at timestamp with time zone;

-- =============================================
-- SOCIAL LINKS ON PROFILES  
-- =============================================
alter table public.profiles add column if not exists twitter_url text;
alter table public.profiles add column if not exists github_url text;
alter table public.profiles add column if not exists linkedin_url text;

-- =============================================
-- REACTIONS (beyond upvotes)
-- =============================================
create table if not exists public.post_reactions (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  reaction text not null check (reaction in ('fire', 'mind_blown', 'clap', 'love', 'thinking')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_reaction unique (post_id, user_id, reaction)
);

create index post_reactions_post_idx on public.post_reactions(post_id);
alter table public.post_reactions enable row level security;
create policy "Reactions are public" on public.post_reactions for select using (true);
create policy "Users can react" on public.post_reactions for insert with check (auth.uid() = user_id);
create policy "Users can unreact" on public.post_reactions for delete using (auth.uid() = user_id);

-- Get reaction counts for a post
create or replace function public.get_post_reactions(p_post_id uuid)
returns table (reaction text, count bigint) as $$
  select reaction, count(*) from public.post_reactions where post_id = p_post_id group by reaction;
$$ language sql;

-- =============================================
-- SERIES / COLLECTIONS OF POSTS
-- =============================================
create table if not exists public.series (
  id uuid default uuid_generate_v4() primary key,
  author_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  slug text not null,
  description text,
  cover_image_url text,
  is_complete boolean default false,
  post_count integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_series_slug unique (author_id, slug)
);

alter table public.posts add column if not exists series_id uuid references public.series(id) on delete set null;
alter table public.posts add column if not exists series_order integer;

create index series_author_idx on public.series(author_id);
create index posts_series_idx on public.posts(series_id);

alter table public.series enable row level security;
create policy "Series are public" on public.series for select using (true);
create policy "Authors manage series" on public.series for all using (auth.uid() = author_id);

-- =============================================
-- KEYBOARD SHORTCUTS PREFERENCES
-- =============================================
alter table public.profiles add column if not exists keyboard_shortcuts_enabled boolean default true;

-- =============================================
-- STRIPE / PAYMENTS
-- =============================================

-- Stripe customer/account links
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_account_id text; -- For payouts
alter table public.profiles add column if not exists stripe_account_enabled boolean default false;

-- Subscription tiers creators can offer
create table if not exists public.subscription_tiers (
  id uuid default uuid_generate_v4() primary key,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  description text,
  price_cents integer not null,
  currency text default 'usd',
  stripe_price_id text,
  benefits text[], -- Array of benefit descriptions
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Paid subscriptions
create table if not exists public.paid_subscriptions (
  id uuid default uuid_generate_v4() primary key,
  subscriber_id uuid references public.profiles(id) on delete cascade not null,
  creator_id uuid references public.profiles(id) on delete cascade not null,
  tier_id uuid references public.subscription_tiers(id) on delete set null,
  stripe_subscription_id text,
  status text default 'active' check (status in ('active', 'canceled', 'past_due', 'paused')),
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  canceled_at timestamp with time zone,
  
  constraint unique_paid_subscription unique (subscriber_id, creator_id)
);

-- Tips / one-time payments
create table if not exists public.tips (
  id uuid default uuid_generate_v4() primary key,
  from_user_id uuid references public.profiles(id) on delete set null,
  to_user_id uuid references public.profiles(id) on delete cascade not null,
  post_id uuid references public.posts(id) on delete set null,
  amount_cents integer not null,
  currency text default 'usd',
  stripe_payment_intent_id text,
  message text,
  is_anonymous boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Payout history
create table if not exists public.payouts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  amount_cents integer not null,
  currency text default 'usd',
  stripe_payout_id text,
  status text default 'pending' check (status in ('pending', 'in_transit', 'paid', 'failed', 'canceled')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  paid_at timestamp with time zone
);

-- Creator earnings tracking
create table if not exists public.earnings (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  source_type text not null check (source_type in ('subscription', 'tip', 'boost')),
  source_id uuid,
  gross_amount_cents integer not null,
  platform_fee_cents integer not null,
  net_amount_cents integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexes
create index subscription_tiers_creator_idx on public.subscription_tiers(creator_id);
create index paid_subscriptions_subscriber_idx on public.paid_subscriptions(subscriber_id);
create index paid_subscriptions_creator_idx on public.paid_subscriptions(creator_id);
create index tips_to_user_idx on public.tips(to_user_id);
create index earnings_user_idx on public.earnings(user_id);

-- RLS
alter table public.subscription_tiers enable row level security;
alter table public.paid_subscriptions enable row level security;
alter table public.tips enable row level security;
alter table public.payouts enable row level security;
alter table public.earnings enable row level security;

create policy "Tiers are public" on public.subscription_tiers for select using (true);
create policy "Creators manage tiers" on public.subscription_tiers for all using (auth.uid() = creator_id);

create policy "Users see own subscriptions" on public.paid_subscriptions for select 
  using (auth.uid() = subscriber_id or auth.uid() = creator_id);
create policy "System manages subscriptions" on public.paid_subscriptions for all using (false);

create policy "Tips visible to recipient" on public.tips for select 
  using (auth.uid() = to_user_id or (auth.uid() = from_user_id and not is_anonymous));

create policy "Users see own payouts" on public.payouts for select using (auth.uid() = user_id);
create policy "Users see own earnings" on public.earnings for select using (auth.uid() = user_id);

-- Get creator earnings summary
create or replace function public.get_earnings_summary(p_user_id uuid)
returns table (
  total_gross bigint,
  total_fees bigint,
  total_net bigint,
  pending_payout bigint,
  subscription_earnings bigint,
  tip_earnings bigint
) as $$
begin
  return query
  select 
    coalesce(sum(gross_amount_cents), 0)::bigint as total_gross,
    coalesce(sum(platform_fee_cents), 0)::bigint as total_fees,
    coalesce(sum(net_amount_cents), 0)::bigint as total_net,
    coalesce(sum(net_amount_cents) filter (where created_at > coalesce(
      (select max(created_at) from public.payouts where user_id = p_user_id and status = 'paid'), 
      '1970-01-01'::timestamptz
    )), 0)::bigint as pending_payout,
    coalesce(sum(net_amount_cents) filter (where source_type = 'subscription'), 0)::bigint as subscription_earnings,
    coalesce(sum(net_amount_cents) filter (where source_type = 'tip'), 0)::bigint as tip_earnings
  from public.earnings
  where user_id = p_user_id;
end;
$$ language plpgsql;

-- =============================================
-- BLOCK / MUTE USERS
-- =============================================

create table if not exists public.user_blocks (
  id uuid default uuid_generate_v4() primary key,
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_block unique (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id != blocked_id)
);

create table if not exists public.user_mutes (
  id uuid default uuid_generate_v4() primary key,
  muter_id uuid references public.profiles(id) on delete cascade not null,
  muted_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_mute unique (muter_id, muted_id),
  constraint no_self_mute check (muter_id != muted_id)
);

create index user_blocks_blocker_idx on public.user_blocks(blocker_id);
create index user_mutes_muter_idx on public.user_mutes(muter_id);

alter table public.user_blocks enable row level security;
alter table public.user_mutes enable row level security;

create policy "Users manage own blocks" on public.user_blocks for all using (auth.uid() = blocker_id);
create policy "Users manage own mutes" on public.user_mutes for all using (auth.uid() = muter_id);

-- Check if user is blocked
create or replace function public.is_blocked(p_user_id uuid, p_target_id uuid)
returns boolean as $$
  select exists(select 1 from public.user_blocks where blocker_id = p_target_id and blocked_id = p_user_id);
$$ language sql security definer;

-- =============================================
-- SCHEDULED POSTS - Add status check
-- =============================================

-- Function to publish scheduled posts (called by cron)
create or replace function public.publish_scheduled_posts()
returns integer as $$
declare
  v_count integer;
begin
  update public.posts
  set 
    status = 'published',
    published_at = now()
  where 
    status = 'scheduled'
    and scheduled_at <= now();
  
  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

-- =============================================
-- DIGEST TRACKING
-- =============================================

create table if not exists public.digest_sends (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  digest_type text not null check (digest_type in ('daily', 'weekly')),
  posts_included uuid[],
  sent_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index digest_sends_user_idx on public.digest_sends(user_id, sent_at desc);

-- Get posts for weekly digest
create or replace function public.get_digest_posts(p_user_id uuid, p_since timestamp with time zone)
returns table (
  post_id uuid,
  title text,
  slug text,
  excerpt text,
  published_at timestamp with time zone,
  author_username text,
  author_display_name text
) as $$
begin
  return query
  select 
    p.id as post_id,
    p.title,
    p.slug,
    p.excerpt,
    p.published_at,
    pr.username as author_username,
    pr.display_name as author_display_name
  from public.posts p
  join public.profiles pr on pr.id = p.author_id
  join public.subscriptions s on s.creator_id = p.author_id
  where s.subscriber_id = p_user_id
    and p.status = 'published'
    and p.published_at > p_since
  order by p.published_at desc
  limit 20;
end;
$$ language plpgsql;

-- =============================================
-- PAID-ONLY POSTS
-- =============================================
alter table public.posts add column if not exists is_premium boolean default false;
alter table public.posts add column if not exists preview_content text; -- Free preview for premium posts
alter table public.posts add column if not exists required_tier_id uuid references public.subscription_tiers(id) on delete set null;

-- Check if user has access to premium post
create or replace function public.has_premium_access(p_user_id uuid, p_post_id uuid)
returns boolean as $$
declare
  v_post record;
begin
  select author_id, is_premium, required_tier_id into v_post 
  from public.posts where id = p_post_id;
  
  -- Not premium = everyone has access
  if not v_post.is_premium then return true; end if;
  
  -- Author always has access
  if v_post.author_id = p_user_id then return true; end if;
  
  -- Check for active paid subscription
  return exists (
    select 1 from public.paid_subscriptions
    where subscriber_id = p_user_id
      and creator_id = v_post.author_id
      and status = 'active'
      and (v_post.required_tier_id is null or tier_id = v_post.required_tier_id)
  );
end;
$$ language plpgsql security definer;

-- =============================================
-- DRAFT PREVIEW LINKS
-- =============================================
alter table public.posts add column if not exists preview_token text;
alter table public.posts add column if not exists preview_expires_at timestamp with time zone;

create index posts_preview_token_idx on public.posts(preview_token) where preview_token is not null;

-- =============================================
-- DRAFT PREVIEW LINKS - Generate tokens
-- =============================================

-- Function to create a preview link for a draft
create or replace function public.create_preview_link(p_post_id uuid, p_expires_hours integer default 72)
returns text as $$
declare
  v_token text;
begin
  -- Generate random token
  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+', '-'), '/', '_'), '=', '');
  
  -- Update post with preview token
  update public.posts
  set 
    preview_token = v_token,
    preview_expires_at = now() + (p_expires_hours || ' hours')::interval
  where id = p_post_id
    and author_id = auth.uid();
  
  return v_token;
end;
$$ language plpgsql security definer;

-- Function to validate preview token
create or replace function public.validate_preview_token(p_token text)
returns uuid as $$
declare
  v_post_id uuid;
begin
  select id into v_post_id
  from public.posts
  where preview_token = p_token
    and preview_expires_at > now();
  
  return v_post_id;
end;
$$ language plpgsql security definer;

-- =============================================
-- COMMENT MODERATION
-- =============================================

alter table public.comments add column if not exists is_hidden boolean default false;
alter table public.comments add column if not exists hidden_at timestamp with time zone;
alter table public.comments add column if not exists hidden_by uuid references public.profiles(id);
alter table public.comments add column if not exists hidden_reason text;

-- Index for fetching visible comments
create index if not exists comments_visible_idx on public.comments(post_id) 
  where is_hidden = false;

-- Function to hide a comment (author of post can hide)
create or replace function public.hide_comment(
  p_comment_id uuid,
  p_reason text default null
)
returns boolean as $$
declare
  v_post_author_id uuid;
  v_comment_author_id uuid;
begin
  -- Get post author and comment author
  select p.author_id, c.author_id into v_post_author_id, v_comment_author_id
  from public.comments c
  join public.posts p on p.id = c.post_id
  where c.id = p_comment_id;
  
  -- Only post author or comment author can hide
  if auth.uid() not in (v_post_author_id, v_comment_author_id) then
    return false;
  end if;
  
  update public.comments
  set 
    is_hidden = true,
    hidden_at = now(),
    hidden_by = auth.uid(),
    hidden_reason = p_reason
  where id = p_comment_id;
  
  return true;
end;
$$ language plpgsql security definer;

-- Function to unhide a comment
create or replace function public.unhide_comment(p_comment_id uuid)
returns boolean as $$
declare
  v_post_author_id uuid;
begin
  -- Get post author
  select p.author_id into v_post_author_id
  from public.comments c
  join public.posts p on p.id = c.post_id
  where c.id = p_comment_id;
  
  -- Only post author can unhide
  if auth.uid() != v_post_author_id then
    return false;
  end if;
  
  update public.comments
  set 
    is_hidden = false,
    hidden_at = null,
    hidden_by = null,
    hidden_reason = null
  where id = p_comment_id;
  
  return true;
end;
$$ language plpgsql security definer;

-- =============================================
-- CONTENT REPORTS
-- =============================================

create table if not exists public.reports (
  id uuid default uuid_generate_v4() primary key,
  reporter_id uuid references public.profiles(id) on delete set null,
  content_type text not null check (content_type in ('post', 'comment', 'profile')),
  content_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'hate_speech', 'misinformation', 'copyright', 'other')),
  description text,
  status text default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'dismissed')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamp with time zone,
  resolution_note text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index reports_status_idx on public.reports(status, created_at desc);
create index reports_content_idx on public.reports(content_type, content_id);

alter table public.reports enable row level security;

-- Users can create reports
create policy "Users can create reports" on public.reports
  for insert with check (auth.uid() = reporter_id);

-- Users can see their own reports
create policy "Users see own reports" on public.reports
  for select using (auth.uid() = reporter_id);

-- =============================================
-- ADMIN / FEATURED MANAGEMENT
-- =============================================

-- Admin role check
alter table public.profiles add column if not exists is_admin boolean default false;

-- Get platform stats for admin dashboard
create or replace function public.get_admin_stats()
returns table (
  total_users bigint,
  total_posts bigint,
  total_comments bigint,
  posts_today bigint,
  users_today bigint,
  pending_reports bigint
) as $$
begin
  return query
  select
    (select count(*) from public.profiles)::bigint as total_users,
    (select count(*) from public.posts where status = 'published')::bigint as total_posts,
    (select count(*) from public.comments)::bigint as total_comments,
    (select count(*) from public.posts where published_at > now() - interval '24 hours')::bigint as posts_today,
    (select count(*) from public.profiles where created_at > now() - interval '24 hours')::bigint as users_today,
    (select count(*) from public.reports where status = 'pending')::bigint as pending_reports;
end;
$$ language plpgsql security definer;

-- =============================================
-- READING LISTS (UI support for existing schema)
-- =============================================

-- Ensure post_count updates
create or replace function public.update_reading_list_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.reading_lists
    set post_count = post_count + 1
    where id = NEW.list_id;
  elsif TG_OP = 'DELETE' then
    update public.reading_lists
    set post_count = post_count - 1
    where id = OLD.list_id;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists reading_list_items_count_trigger on public.reading_list_items;
create trigger reading_list_items_count_trigger
  after insert or delete on public.reading_list_items
  for each row execute function public.update_reading_list_count();

-- =============================================
-- PINNED POSTS
-- =============================================

-- Add pin order for multiple pinned posts
alter table public.posts add column if not exists pin_order integer default 0;

-- Index for fetching pinned posts efficiently
create index if not exists posts_pinned_idx on public.posts(author_id, pin_order desc) 
  where is_pinned = true;

-- Function to pin a post
create or replace function public.pin_post(p_post_id uuid)
returns boolean as $$
declare
  v_max_order integer;
begin
  -- Get current max pin order for this author's posts
  select coalesce(max(pin_order), 0) into v_max_order
  from public.posts
  where author_id = auth.uid() and is_pinned = true;
  
  -- Pin the post
  update public.posts
  set is_pinned = true, pin_order = v_max_order + 1
  where id = p_post_id and author_id = auth.uid();
  
  return found;
end;
$$ language plpgsql security definer;

-- Function to unpin a post
create or replace function public.unpin_post(p_post_id uuid)
returns boolean as $$
begin
  update public.posts
  set is_pinned = false, pin_order = 0
  where id = p_post_id and author_id = auth.uid();
  
  return found;
end;
$$ language plpgsql security definer;

-- =============================================
-- COMMENT NOTIFICATIONS
-- =============================================

-- Trigger to create notification when comment is added
create or replace function public.notify_on_comment()
returns trigger as $$
declare
  v_post_author_id uuid;
  v_parent_author_id uuid;
  v_commenter_name text;
begin
  -- Get post author
  select author_id into v_post_author_id from public.posts where id = NEW.post_id;
  
  -- Get commenter name
  select coalesce(display_name, username) into v_commenter_name 
  from public.profiles where id = NEW.author_id;
  
  -- Notify post author (if not self-comment)
  if v_post_author_id != NEW.author_id then
    insert into public.notifications (user_id, type, actor_id, post_id, comment_id, title, body)
    values (
      v_post_author_id,
      'comment',
      NEW.author_id,
      NEW.post_id,
      NEW.id,
      'New comment on your post',
      v_commenter_name || ' commented on your post'
    );
  end if;
  
  -- If this is a reply, notify parent comment author
  if NEW.parent_id is not null then
    select author_id into v_parent_author_id from public.comments where id = NEW.parent_id;
    
    if v_parent_author_id != NEW.author_id and v_parent_author_id != v_post_author_id then
      insert into public.notifications (user_id, type, actor_id, post_id, comment_id, title, body)
      values (
        v_parent_author_id,
        'reply',
        NEW.author_id,
        NEW.post_id,
        NEW.id,
        'New reply to your comment',
        v_commenter_name || ' replied to your comment'
      );
    end if;
  end if;
  
  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists comment_notification_trigger on public.comments;
create trigger comment_notification_trigger
  after insert on public.comments
  for each row execute function public.notify_on_comment();

-- =============================================
-- IMAGE PROCESSING TRACKING
-- =============================================

create table if not exists public.images (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  original_url text not null,
  optimized_url text,
  thumbnail_url text,
  width integer,
  height integer,
  size_bytes integer,
  optimized_size_bytes integer,
  format text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index images_user_idx on public.images(user_id);

alter table public.images enable row level security;
create policy "Users manage own images" on public.images for all using (auth.uid() = user_id);

-- =============================================
-- CO-AUTHORS
-- =============================================

create table if not exists public.post_coauthors (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  role text default 'coauthor' check (role in ('coauthor', 'contributor', 'editor')),
  added_by uuid references public.profiles(id),
  accepted boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_coauthor unique (post_id, user_id)
);

create index post_coauthors_post_idx on public.post_coauthors(post_id);
create index post_coauthors_user_idx on public.post_coauthors(user_id);

alter table public.post_coauthors enable row level security;

-- Anyone can see accepted coauthors
create policy "Public can view accepted coauthors" on public.post_coauthors
  for select using (accepted = true);

-- Post author can manage coauthors
create policy "Post author manages coauthors" on public.post_coauthors
  for all using (
    exists (select 1 from public.posts where id = post_id and author_id = auth.uid())
  );

-- Invited user can see and accept their invitation
create policy "Users see own invitations" on public.post_coauthors
  for select using (user_id = auth.uid());

create policy "Users can accept invitations" on public.post_coauthors
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Get coauthors for a post
create or replace function public.get_post_coauthors(p_post_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role text,
  accepted boolean
) as $$
begin
  return query
  select 
    pc.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    pc.role,
    pc.accepted
  from public.post_coauthors pc
  join public.profiles p on p.id = pc.user_id
  where pc.post_id = p_post_id
  order by pc.created_at;
end;
$$ language plpgsql;

-- =============================================
-- CANONICAL URLS
-- =============================================

alter table public.posts add column if not exists canonical_url text;
alter table public.posts add column if not exists originally_published_at timestamp with time zone;
alter table public.posts add column if not exists original_source text; -- e.g., 'Medium', 'Substack', 'Personal Blog'
-- Allow pulse content type for existing databases
alter table public.posts drop constraint if exists posts_content_type_check;
alter table public.posts
  add constraint posts_content_type_check
  check (content_type in ('html', 'markdown', 'rich', 'pulse'));

-- =============================================
-- WEBMENTIONS
-- =============================================

create table if not exists public.webmentions (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  source_url text not null,
  target_url text not null,
  mention_type text check (mention_type in ('mention', 'reply', 'like', 'repost', 'bookmark')),
  author_name text,
  author_url text,
  author_avatar text,
  content text,
  published_at timestamp with time zone,
  verified boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  constraint unique_webmention unique (post_id, source_url)
);

create index webmentions_post_idx on public.webmentions(post_id);
create index webmentions_verified_idx on public.webmentions(post_id) where verified = true;

alter table public.webmentions enable row level security;

create policy "Public can view verified webmentions" on public.webmentions
  for select using (verified = true);

-- =============================================
-- NEWSLETTER ARCHIVE
-- =============================================

create table if not exists public.newsletters (
  id uuid default uuid_generate_v4() primary key,
  author_id uuid references public.profiles(id) on delete cascade not null,
  subject text not null,
  content_html text not null,
  preview_text text,
  post_ids uuid[], -- Posts included in this newsletter
  recipient_count integer default 0,
  sent_at timestamp with time zone,
  is_public boolean default true, -- Whether to show in archive
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index newsletters_author_idx on public.newsletters(author_id, sent_at desc);

alter table public.newsletters enable row level security;

create policy "Public newsletters visible" on public.newsletters
  for select using (is_public = true and sent_at is not null);

create policy "Authors manage own newsletters" on public.newsletters
  for all using (auth.uid() = author_id);

-- =============================================
-- INTEGRATION KEYS (BYOK)
-- =============================================
create table public.integration_keys (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  provider text not null,
  label text,
  is_active boolean default true,
  quota_limit_usd numeric(10,2),
  encrypted_key text not null,
  iv text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint unique_integration_key unique (user_id, provider, label)
);

create index integration_keys_user_idx on public.integration_keys(user_id);
create index integration_keys_provider_idx on public.integration_keys(provider);
create index integration_keys_active_idx on public.integration_keys(user_id, provider) where is_active = true;

-- Allow existing databases to add BYOK columns
alter table public.profiles add column if not exists is_pro boolean default false;
alter table public.integration_keys add column if not exists is_active boolean default true;
alter table public.integration_keys add column if not exists quota_limit_usd numeric(10,2);

  -- =============================================
  -- FEED SOURCES (RSS, X, etc.)
  -- =============================================
  create table public.feed_sources (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  source_type text not null check (source_type in ('rss', 'x', 'youtube', 'grok', 'linkedin', 'hn', 'trends')),
  name text,
  url text not null,
  publication_id uuid references public.publications(id) on delete set null,
  auto_convert_to_drafts boolean default false,
  is_active boolean default true,
  last_fetched_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

  create index feed_sources_user_idx on public.feed_sources(user_id);

  -- =============================================
  -- STORAGE CONNECTIONS (R2/S3)
  -- =============================================
  create table public.storage_connections (
    id uuid default uuid_generate_v4() primary key,
    user_id uuid references public.profiles(id) on delete cascade not null,
    provider text not null check (provider in ('r2', 's3')),
    access_key_id text not null,
    bucket text not null,
    region text,
    endpoint text,
    public_base_url text,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    constraint unique_storage_connection unique (user_id, provider)
  );

  create index storage_connections_user_idx on public.storage_connections(user_id);
  create index storage_connections_active_idx on public.storage_connections(user_id, provider) where is_active = true;

  -- =============================================
  -- VIDEO BRIEFS (HEYGEN/SYNTHESIA)
  -- =============================================
  create table public.video_briefs (
    id uuid default uuid_generate_v4() primary key,
    post_id uuid references public.posts(id) on delete cascade,
    author_id uuid references public.profiles(id) on delete cascade not null,
    provider text not null check (provider in ('heygen', 'synthesia')),
    script text not null,
    status text not null default 'queued' check (status in ('queued', 'ready', 'error')),
    provider_payload jsonb,
    provider_response jsonb,
    error_message text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
  );

  create index video_briefs_author_idx on public.video_briefs(author_id);
  create index video_briefs_post_idx on public.video_briefs(post_id);
create index feed_sources_type_idx on public.feed_sources(source_type);
create index feed_sources_active_idx on public.feed_sources(is_active);

-- =============================================
-- INBOX ITEMS (Pulled content awaiting review)
-- =============================================
create table public.inbox_items (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  source_type text not null,
  source_url text,
  title text,
  canonical_url text,
  raw_data jsonb not null default '{}'::jsonb,
  status text default 'new' check (status in ('new', 'imported', 'ignored')),
  published_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index inbox_items_user_idx on public.inbox_items(user_id);
create index inbox_items_status_idx on public.inbox_items(status);
create index inbox_items_source_type_idx on public.inbox_items(source_type);

-- =============================================
-- ASSETS (Provenance-first vault)
-- =============================================
create table public.assets (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  publication_id uuid references public.publications(id) on delete set null,
  type text not null check (type in ('prompt', 'image', 'code', 'text', 'link', 'quote', 'fragment')),
  title text,
  content text not null,
  source_platform text,
  source_url text,
  meta jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index assets_user_idx on public.assets(user_id);
create index assets_publication_idx on public.assets(publication_id);
create index assets_type_idx on public.assets(type);
create index assets_tags_gin on public.assets using gin(tags);
create index assets_source_platform_idx on public.assets(source_platform);
create index assets_source_url_idx on public.assets(source_url);

-- =============================================
-- POST_ASSETS (Join table: posts ↔ assets)
-- =============================================
create table public.post_assets (
  id uuid default uuid_generate_v4() primary key,
  post_id uuid references public.posts(id) on delete cascade not null,
  asset_id uuid references public.assets(id) on delete cascade not null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint unique_post_asset unique (post_id, asset_id)
);

create index post_assets_post_idx on public.post_assets(post_id);
create index post_assets_asset_idx on public.post_assets(asset_id);

-- =============================================
-- RLS: integration keys
-- =============================================
  alter table public.integration_keys enable row level security;

  alter table public.storage_connections enable row level security;
  alter table public.video_briefs enable row level security;

  create policy "Users manage their integration keys"
    on public.integration_keys for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create policy "Users manage their storage connections"
    on public.storage_connections for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

  create policy "Users manage their video briefs"
    on public.video_briefs for all
    using (auth.uid() = author_id)
    with check (auth.uid() = author_id);

-- =============================================
-- AUTOMATION API KEYS
-- =============================================
create table public.api_keys (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  label text,
  key_hash text not null,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index api_keys_user_idx on public.api_keys(user_id);

alter table public.api_keys enable row level security;

create policy "Users manage their api keys"
  on public.api_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================
-- RLS: feed sources
-- =============================================
alter table public.feed_sources enable row level security;

create policy "Users manage their feed sources"
  on public.feed_sources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================
-- RLS: inbox items
-- =============================================
alter table public.inbox_items enable row level security;

create policy "Users manage their inbox items"
  on public.inbox_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================
-- RLS: assets
-- =============================================
alter table public.assets enable row level security;

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

-- =============================================
-- RLS: post assets
-- =============================================
alter table public.post_assets enable row level security;

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
