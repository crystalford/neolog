-- Create base Entities and polymorphic Entity Mentions tables
-- This script safely creates the `entities` and `entity_mentions` tables,
-- allowing mentions to be linked to EITHER video_uploads OR log_entries.

-- 1. Entities: living, accumulating concepts tracked across sessions
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'project', 'idea', 'person', 'goal', 'question',
    'habit', 'topic', 'commitment', 'skill', 'blocker'
  )),
  name text not null,
  slug text not null,
  summary text,
  status text check (status in ('active', 'dormant', 'resolved', 'abandoned')),
  first_mentioned_at timestamptz not null default now(),
  last_mentioned_at timestamptz not null default now(),
  mention_count int not null default 1,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, type, slug)
);

create index if not exists idx_entities_user_type on entities(user_id, type);
create index if not exists idx_entities_user_last_mentioned on entities(user_id, last_mentioned_at desc);
create index if not exists idx_entities_user_mention_count on entities(user_id, mention_count desc);

-- 2. Entity mentions: each time an entity is referenced in a session (video, chat, etc)
create table if not exists entity_mentions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  
  -- Polymorphic sources
  video_upload_id uuid references video_uploads(id) on delete cascade,
  log_entry_id uuid references log_entries(id) on delete cascade,
  
  -- Explicit source type
  source_type text not null check (source_type in ('video', 'chat', 'text', 'capture')),
  
  context text not null,
  sentiment text check (sentiment in ('positive', 'negative', 'neutral')),
  created_at timestamptz not null default now(),

  -- Ensure an entity mention has exactly ONE source
  constraint mention_has_one_source check (
    (video_upload_id is not null and log_entry_id is null) or
    (video_upload_id is null and log_entry_id is not null)
  )
);

create index if not exists idx_entity_mentions_entity on entity_mentions(entity_id, created_at desc);
create index if not exists idx_entity_mentions_video on entity_mentions(video_upload_id);
create index if not exists idx_entity_mentions_log_entry on entity_mentions(log_entry_id);
create index if not exists idx_entity_mentions_source_type on entity_mentions(source_type);

-- 3. RLS Policies
alter table entities enable row level security;
alter table entity_mentions enable row level security;

-- Entities Policies
create policy "Users can view own entities"
  on entities for select using (auth.uid() = user_id);
create policy "Users can insert own entities"
  on entities for insert with check (auth.uid() = user_id);
create policy "Users can update own entities"
  on entities for update using (auth.uid() = user_id);
create policy "Users can delete own entities"
  on entities for delete using (auth.uid() = user_id);
create policy "Service role full access to entities"
  on entities for all using (auth.role() = 'service_role');

-- Entity Mentions Policies
create policy "Users can view own entity mentions"
  on entity_mentions for select
  using (exists (
    select 1 from entities where entities.id = entity_mentions.entity_id and entities.user_id = auth.uid()
  ));
create policy "Users can insert own entity mentions"
  on entity_mentions for insert
  with check (exists (
    select 1 from entities where entities.id = entity_mentions.entity_id and entities.user_id = auth.uid()
  ));
create policy "Users can update own entity mentions"
  on entity_mentions for update
  using (exists (
    select 1 from entities where entities.id = entity_mentions.entity_id and entities.user_id = auth.uid()
  ));
create policy "Users can delete own entity mentions"
  on entity_mentions for delete
  using (exists (
    select 1 from entities where entities.id = entity_mentions.entity_id and entities.user_id = auth.uid()
  ));
create policy "Service role full access to entity mentions"
  on entity_mentions for all using (auth.role() = 'service_role');
