-- Helper script to clean up duplicate publications before adding constraint
-- Run this BEFORE the one_publication_per_user migration if you have duplicates

-- Step 1: Find users with multiple publications
SELECT 
  owner_id,
  COUNT(*) as publication_count,
  ARRAY_AGG(id ORDER BY created_at DESC) as publication_ids,
  ARRAY_AGG(name ORDER BY created_at DESC) as publication_names
FROM publications
GROUP BY owner_id
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- Step 2: For each user with multiple publications, keep the most recent one
-- and delete the others. Uncomment and run this after reviewing:

/*
WITH ranked_publications AS (
  SELECT 
    id,
    owner_id,
    ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at DESC) as rn
  FROM publications
)
DELETE FROM publications
WHERE id IN (
  SELECT id FROM ranked_publications WHERE rn > 1
);
*/

-- Step 3: Verify no duplicates remain
SELECT 
  owner_id,
  COUNT(*) as publication_count
FROM publications
GROUP BY owner_id
HAVING COUNT(*) > 1;

-- If this returns no rows, you're ready to run the one_publication_per_user migration!
