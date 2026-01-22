-- Cross-Platform Publishing Schema
-- Enables users to auto-publish from Neolog to Medium, Dev.to, Hashnode, LinkedIn

-- Table: syndication_connections
-- Stores user's connected platforms and OAuth tokens
CREATE TABLE IF NOT EXISTS syndication_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('medium', 'devto', 'hashnode', 'linkedin')),
  
  -- Tokens (encrypted in application layer)
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- Platform user info
  platform_user_id TEXT,
  platform_username TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One connection per platform per user
  UNIQUE(user_id, platform)
);

-- Table: syndication_posts
-- Tracks which posts were syndicated to which platforms
CREATE TABLE IF NOT EXISTS syndication_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('medium', 'devto', 'hashnode', 'linkedin')),
  
  -- Platform post info
  platform_post_id TEXT,
  platform_url TEXT,
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'failed')),
  error_message TEXT,
  
  -- Timestamps
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One syndication per post per platform
  UNIQUE(post_id, platform)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_syndication_connections_user ON syndication_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_syndication_connections_platform ON syndication_connections(platform);
CREATE INDEX IF NOT EXISTS idx_syndication_posts_post ON syndication_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_syndication_posts_status ON syndication_posts(status);

-- RLS Policies
ALTER TABLE syndication_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE syndication_posts ENABLE ROW LEVEL SECURITY;

-- Users can manage their own connections
CREATE POLICY "Users can view own connections"
  ON syndication_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON syndication_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON syndication_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON syndication_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Users can view syndication posts for their own posts
CREATE POLICY "Users can view own syndication posts"
  ON syndication_posts FOR SELECT
  USING (
    post_id IN (
      SELECT id FROM posts WHERE author_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert syndication posts"
  ON syndication_posts FOR INSERT
  WITH CHECK (
    post_id IN (
      SELECT id FROM posts WHERE author_id = auth.uid()
    )
  );

CREATE POLICY "Users can update syndication posts"
  ON syndication_posts FOR UPDATE
  USING (
    post_id IN (
      SELECT id FROM posts WHERE author_id = auth.uid()
    )
  );

-- Comments
COMMENT ON TABLE syndication_connections IS 'Stores user connections to external publishing platforms';
COMMENT ON TABLE syndication_posts IS 'Tracks posts syndicated to external platforms';
