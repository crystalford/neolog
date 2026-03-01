-- Clip sessions: groups of video uploads analyzed together for cross-clip synthesis
-- and AI-generated edit decision lists (EDLs) that produce finished video edits.

create table if not exists clip_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  title text,                              -- auto-generated or user-set
  status text not null default 'collecting'
    check (status in ('collecting', 'processing', 'synthesized', 'error')),

  -- Cross-clip synthesis output (themes, narrative arcs, connections, best moments)
  synthesis jsonb,
  synthesis_model text,

  -- Edit decision lists: ordered sequences of hard cuts from source clips
  edit_plans jsonb,

  -- Stats
  clip_count int not null default 0,
  total_duration_seconds numeric,

  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Link uploads to a session
alter table video_uploads
  add column if not exists session_id uuid references clip_sessions(id) on delete set null;

create index if not exists idx_clip_sessions_user_id on clip_sessions(user_id);
create index if not exists idx_clip_sessions_status on clip_sessions(user_id, status);
create index if not exists idx_clip_sessions_created on clip_sessions(user_id, created_at desc);
create index if not exists idx_video_uploads_session on video_uploads(session_id);

-- RLS
alter table clip_sessions enable row level security;

create policy "Users can manage own clip sessions"
  on clip_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access to clip sessions"
  on clip_sessions for all
  using (auth.role() = 'service_role');

-- Helper function to atomically increment session clip count
create or replace function increment_session_clip_count(session_id uuid)
returns void
language sql
security definer
as $$
  update clip_sessions
  set clip_count = clip_count + 1,
      updated_at = now()
  where id = session_id;
$$;
