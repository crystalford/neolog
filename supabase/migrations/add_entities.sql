-- Entities: living, accumulating concepts tracked across video sessions
-- Each entity (project, idea, person, goal, etc.) grows over time as
-- the user mentions it across recordings.
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

-- Entity mentions: each time an entity is referenced in a video
create table if not exists entity_mentions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references entities(id) on delete cascade,
  video_upload_id uuid not null references video_uploads(id) on delete cascade,
  context text not null,
  sentiment text check (sentiment in ('positive', 'negative', 'neutral')),
  created_at timestamptz not null default now()
);

create index if not exists idx_entity_mentions_entity on entity_mentions(entity_id, created_at desc);
create index if not exists idx_entity_mentions_video on entity_mentions(video_upload_id);

-- RLS
alter table entities enable row level security;
alter table entity_mentions enable row level security;

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
create policy "Service role full access to entity mentions"
  on entity_mentions for all using (auth.role() = 'service_role');
