-- Fix entity_mentions to support polymorphic sources (video, chat, text, capture)
--
-- The original add_entities.sql created entity_mentions with video_upload_id NOT NULL.
-- The 20260310_generalize_entity_mentions.sql used CREATE TABLE IF NOT EXISTS, which
-- silently does nothing when the table already exists. This migration correctly
-- ALTERs the existing table to add the polymorphic columns.

-- 1. Make video_upload_id nullable (was NOT NULL)
ALTER TABLE entity_mentions
  ALTER COLUMN video_upload_id DROP NOT NULL;

-- 2. Add log_entry_id for chat/text sessions
ALTER TABLE entity_mentions
  ADD COLUMN IF NOT EXISTS log_entry_id uuid REFERENCES log_entries(id) ON DELETE CASCADE;

-- 3. Add explicit source_type enum column
ALTER TABLE entity_mentions
  ADD COLUMN IF NOT EXISTS source_type text CHECK (source_type IN ('video', 'chat', 'text', 'capture'));

-- 4. Backfill existing rows (all existing rows are from videos)
UPDATE entity_mentions
  SET source_type = 'video'
  WHERE source_type IS NULL;

-- 5. Now enforce NOT NULL
ALTER TABLE entity_mentions
  ALTER COLUMN source_type SET NOT NULL;

-- 6. Add constraint: each mention must have exactly one source
ALTER TABLE entity_mentions
  ADD CONSTRAINT mention_has_one_source CHECK (
    (video_upload_id IS NOT NULL AND log_entry_id IS NULL) OR
    (video_upload_id IS NULL AND log_entry_id IS NOT NULL)
  );

-- 7. Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_entity_mentions_log_entry ON entity_mentions(log_entry_id);
CREATE INDEX IF NOT EXISTS idx_entity_mentions_source_type ON entity_mentions(source_type);
