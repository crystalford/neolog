-- Neolog Publishing API Schema
-- Enables external platforms to publish content to Neolog via API

-- Table: api_keys
-- Stores API keys for external integrations
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "Canopticon Integration"
  key_hash TEXT NOT NULL UNIQUE, -- bcrypt hash of key
  key_prefix TEXT NOT NULL, -- "neo_abc..." for display
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- Table: api_usage
-- Tracks API usage for rate limiting and analytics
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_usage_key_time ON api_usage(api_key_id, created_at);

-- Add API metadata columns to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS api_source TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS api_metadata JSONB;

-- RLS Policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Users can manage their own API keys
CREATE POLICY "Users can view own API keys"
  ON api_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON api_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON api_keys FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON api_keys FOR DELETE
  USING (auth.uid() = user_id);

-- Users can view their own API usage
CREATE POLICY "Users can view own API usage"
  ON api_usage FOR SELECT
  USING (
    api_key_id IN (
      SELECT id FROM api_keys WHERE user_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE api_keys IS 'API keys for external platform integrations';
COMMENT ON TABLE api_usage IS 'API usage tracking for rate limiting and analytics';
COMMENT ON COLUMN posts.api_source IS 'Source platform if published via API (e.g., canopticon)';
COMMENT ON COLUMN posts.api_metadata IS 'Additional metadata from source platform';
