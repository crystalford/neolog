-- Custom Domain Support for Publications
-- Allows publications to use custom domains (e.g., blog.example.com)

-- Add custom domain fields to publications table
ALTER TABLE publications 
  ADD COLUMN IF NOT EXISTS custom_domain TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS domain_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS domain_verification_token TEXT,
  ADD COLUMN IF NOT EXISTS domain_added_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS domain_verified_at TIMESTAMPTZ;

-- Index for fast domain lookups
CREATE INDEX IF NOT EXISTS idx_publications_custom_domain 
  ON publications(custom_domain) 
  WHERE custom_domain IS NOT NULL;

-- Domain verification attempts table for debugging
CREATE TABLE IF NOT EXISTS domain_verification_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  publication_id UUID REFERENCES publications(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  verification_method TEXT NOT NULL, -- 'dns', 'txt'
  status TEXT NOT NULL, -- 'pending', 'verified', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_domain_verification_publication 
  ON domain_verification_attempts(publication_id);

-- RLS Policies
ALTER TABLE domain_verification_attempts ENABLE ROW LEVEL SECURITY;

-- Publication owners can view their verification attempts
CREATE POLICY "Owners can view verification attempts"
  ON domain_verification_attempts
  FOR SELECT
  USING (
    publication_id IN (
      SELECT id FROM publications WHERE owner_id = auth.uid()
    )
  );

-- Publication owners can insert verification attempts
CREATE POLICY "Owners can create verification attempts"
  ON domain_verification_attempts
  FOR INSERT
  WITH CHECK (
    publication_id IN (
      SELECT id FROM publications WHERE owner_id = auth.uid()
    )
  );

COMMENT ON TABLE domain_verification_attempts IS 'Tracks domain verification attempts for debugging and support';
COMMENT ON COLUMN publications.custom_domain IS 'Custom domain for this publication (e.g., blog.example.com)';
COMMENT ON COLUMN publications.domain_verified IS 'Whether the custom domain has been verified';
