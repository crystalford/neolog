-- Video uploads: raw video/audio files uploaded for transcription and analysis
create table if not exists video_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- File metadata
  file_name text not null,
  file_size_bytes bigint not null,
  mime_type text not null,
  duration_seconds numeric,
  storage_path text not null,
  storage_provider text not null default 'supabase', -- 'supabase' | 's3' | 'r2'

  -- Processing pipeline status
  status text not null default 'uploaded'
    check (status in ('uploaded','transcribing','analyzing','processed','error','deleting','deleted')),

  -- Transcription output
  transcript text,
  transcript_segments jsonb, -- [{start, end, text}] timestamped segments
  transcript_language text,
  transcript_model text,     -- e.g. 'whisper-1'

  -- Analysis output
  analysis jsonb,            -- structured AI analysis (categories, ideas, projects, etc.)
  analysis_model text,       -- e.g. 'gpt-4o', 'claude-3-5-sonnet'

  -- Generated outputs
  generated_posts jsonb,     -- [{title, content, type}] blog posts / logs created
  generated_clips jsonb,     -- [{start, end, title, transcript}] suggested social clips
  tags text[] default '{}',  -- auto-assigned tags

  -- Lifecycle
  error_message text,
  source_deleted boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for user listing and status filtering
create index if not exists idx_video_uploads_user_id on video_uploads(user_id);
create index if not exists idx_video_uploads_status on video_uploads(user_id, status);
create index if not exists idx_video_uploads_created on video_uploads(user_id, created_at desc);

-- RLS
alter table video_uploads enable row level security;

-- Users can only see their own uploads
create policy "Users can view own video uploads"
  on video_uploads for select
  using (auth.uid() = user_id);

create policy "Users can insert own video uploads"
  on video_uploads for insert
  with check (auth.uid() = user_id);

create policy "Users can update own video uploads"
  on video_uploads for update
  using (auth.uid() = user_id);

create policy "Users can delete own video uploads"
  on video_uploads for delete
  using (auth.uid() = user_id);

-- Service role bypass for background processing
create policy "Service role full access to video uploads"
  on video_uploads for all
  using (auth.role() = 'service_role');
