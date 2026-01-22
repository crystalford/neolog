-- Newsletter Subscribers Table
-- Stores email subscriptions for author newsletters

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed BOOLEAN DEFAULT FALSE,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_author_id ON newsletter_subscribers(author_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email);

-- RLS Policies
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Authors can read their own subscribers
CREATE POLICY "Authors can view their subscribers"
  ON newsletter_subscribers
  FOR SELECT
  USING (auth.uid() = author_id);

-- Anyone can subscribe (insert)
CREATE POLICY "Anyone can subscribe"
  ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (true);

-- Subscribers can unsubscribe themselves
CREATE POLICY "Users can unsubscribe"
  ON newsletter_subscribers
  FOR UPDATE
  USING (email = current_setting('request.jwt.claims', true)::json->>'email')
  WITH CHECK (email = current_setting('request.jwt.claims', true)::json->>'email');

COMMENT ON TABLE newsletter_subscribers IS 'Stores newsletter subscription data for authors';
