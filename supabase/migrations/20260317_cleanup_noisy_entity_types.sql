-- Migration: Remove low-signal entity types from knowledge graph
-- These types accumulated noise and are no longer tracked going forward.
-- Run once against production Supabase.
--
-- Types removed: question, habit, commitment, skill, blocker, reference,
--                story, opinion, lesson, tool, principle
--
-- entity_mentions rows are cleaned up via FK cascade (entity_id references entities.id).
-- Verify cascade exists before running:
--   SELECT constraint_name, delete_rule
--   FROM information_schema.referential_constraints
--   WHERE constraint_name LIKE '%entity_mentions%';

DELETE FROM entities
WHERE type IN (
  'question',
  'habit',
  'commitment',
  'skill',
  'blocker',
  'reference',
  'story',
  'opinion',
  'lesson',
  'tool',
  'principle'
);

-- Verify remaining types:
-- SELECT type, count(*) FROM entities GROUP BY type ORDER BY count DESC;
