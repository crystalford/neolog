-- Add synthesis_history to project_documents
-- Stores up to 10 previous synthesis snapshots for delta/diff view
ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS synthesis_history jsonb DEFAULT '[]';

-- Each element: { synthesized_at, mention_count, overview, decisions_log, action_items, roadmap }
COMMENT ON COLUMN project_documents.synthesis_history IS
  'Rolling history of past synthesized states — used to compute delta view (what changed since last week)';
