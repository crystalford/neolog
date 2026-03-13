-- Word-level transcript data for Descript-style editing
-- Only populated for uploads processed after this migration runs
create table if not exists transcript_words (
  id uuid primary key default gen_random_uuid(),
  video_upload_id uuid not null references video_uploads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text not null,
  start_time float not null,   -- seconds from start of video
  end_time float not null,     -- seconds from start of video
  confidence float,            -- 0–1, from Whisper
  is_cut boolean not null default false,  -- true = this word is excluded from the edit
  word_index int not null,     -- sequential position in transcript

  unique(video_upload_id, word_index)
);

create index if not exists idx_transcript_words_upload on transcript_words(video_upload_id);
create index if not exists idx_transcript_words_user on transcript_words(user_id);
create index if not exists idx_transcript_words_cut on transcript_words(video_upload_id, is_cut);

alter table transcript_words enable row level security;

create policy "Users can view own transcript words"
  on transcript_words for select
  using (auth.uid() = user_id);

create policy "Users can update own transcript words"
  on transcript_words for update
  using (auth.uid() = user_id);

create policy "Service role full access to transcript words"
  on transcript_words for all
  using (auth.role() = 'service_role');
