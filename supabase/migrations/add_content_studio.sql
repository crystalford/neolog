-- Content Studio: voice profile + AI-generated content drafts
-- Run in Supabase SQL editor before deploying

-- 1. Voice profile column on profiles (accumulates across sessions)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS voice_profile jsonb;

-- 2. Content drafts table
CREATE TABLE IF NOT EXISTS content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content
  format text NOT NULL DEFAULT 'video_essay',  -- 'video_essay' | 'article' | 'thread'
  title text NOT NULL,
  hook text,                                   -- opening line / teleprompter start
  body text NOT NULL,                          -- full verbatim script
  word_count int,
  estimated_duration_seconds int,              -- ~130 wpm spoken

  -- Source
  source_type text,     -- 'strong_opinion' | 'idea' | 'key_win' | 'synthesis'
  source_text text,     -- the seed that was expanded
  source_upload_ids uuid[],

  -- Status
  status text NOT NULL DEFAULT 'draft',        -- 'generating' | 'draft' | 'ready' | 'archived'

  -- Meta
  generation_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE content_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own drafts"
  ON content_drafts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own drafts"
  ON content_drafts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to content_drafts"
  ON content_drafts FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast dashboard queries
CREATE INDEX IF NOT EXISTS content_drafts_user_status_idx
  ON content_drafts (user_id, status, created_at DESC);
