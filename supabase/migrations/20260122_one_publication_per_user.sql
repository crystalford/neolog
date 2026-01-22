-- Enforce one publication per user
-- This migration adds a unique constraint to ensure each user can only have one publication

-- First, let's identify and handle any users with multiple publications
-- (This is a safety check - you may want to manually review these first)

-- Add unique constraint on owner_id
-- This will fail if any user currently has multiple publications
-- If it fails, you'll need to manually clean up duplicate publications first

DO $$
BEGIN
  -- Check if constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'publications_owner_id_unique'
  ) THEN
    -- Add the unique constraint
    ALTER TABLE publications 
      ADD CONSTRAINT publications_owner_id_unique UNIQUE (owner_id);
    
    RAISE NOTICE 'Added unique constraint: one publication per user';
  ELSE
    RAISE NOTICE 'Constraint already exists';
  END IF;
END $$;

-- Optional: Add a comment explaining the constraint
COMMENT ON CONSTRAINT publications_owner_id_unique ON publications IS 
  'Ensures each user can only have one publication (simplified model)';

-- Note: If this migration fails, it means some users have multiple publications.
-- You'll need to decide which publication to keep for each user and delete the others.
-- Query to find users with multiple publications:
-- SELECT owner_id, COUNT(*) as pub_count 
-- FROM publications 
-- GROUP BY owner_id 
-- HAVING COUNT(*) > 1;
