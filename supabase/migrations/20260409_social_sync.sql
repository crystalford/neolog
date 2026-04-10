-- Migration: Add Social Integrations and Social Queue
-- This enables connecting external platforms (X/Twitter) and managing a post queue.

-- Table: social_integrations
-- Stores OAuth tokens for social platforms
CREATE TABLE IF NOT EXISTS social_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'x', 'linkedin', etc.
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  platform_user_id TEXT,
  platform_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- Table: social_queue (Ensuring it exists with proper fields)
CREATE TABLE IF NOT EXISTS social_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  platform TEXT DEFAULT 'x',
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'scheduled', 'posted', 'skipped', 'failed'
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  error_log TEXT,
  source_upload_id UUID REFERENCES video_uploads(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_queue_user_status ON social_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_social_queue_scheduled ON social_queue(scheduled_at) WHERE status = 'scheduled';

-- RLS
ALTER TABLE social_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_queue ENABLE ROW LEVEL SECURITY;

-- Policies for social_integrations
CREATE POLICY "Users can manage own social integrations"
  ON social_integrations FOR ALL
  USING (auth.uid() = user_id);

-- Policies for social_queue
CREATE POLICY "Users can manage own social queue"
  ON social_queue FOR ALL
  USING (auth.uid() = user_id);
