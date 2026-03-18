-- Project Intelligence: living documents per project
-- Adds richer context capture for entity mentions + a synthesized document table per project

-- 1. Richer context for project entity mentions
--    Captures the full discourse about a project in a recording session,
--    even when the project name was only mentioned once at the start.
ALTER TABLE entity_mentions ADD COLUMN IF NOT EXISTS full_context text;

-- 2. Living project documents (one per entity of type 'project')
CREATE TABLE IF NOT EXISTS project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Classification
  project_type text NOT NULL DEFAULT 'tech'
    CHECK (project_type IN ('tech', 'book', 'creative', 'business', 'personal', 'other')),

  -- AI-synthesized sections (all nullable — generated on demand, regeneratable)
  overview text,                         -- what this project is / does
  decisions_log jsonb DEFAULT '[]',      -- [{decision, reasoning, date, source_upload_id}]
  action_items jsonb DEFAULT '[]',       -- [{item, status, mentioned_at, source_upload_id}]
  roadmap jsonb DEFAULT '[]',            -- [{item, priority, status}]
  technical_notes text,                  -- architecture, stack, key technical decisions
  narrative_overview text,               -- story arc synthesized across all sessions (book/creative)
  origin_story text,                     -- how this project started (universal)

  -- User-editable (persists across regenerations)
  manual_notes text,

  -- Synthesis metadata
  last_synthesized_at timestamptz,
  synthesis_model text,
  mention_count_at_synthesis int,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(entity_id)
);

CREATE INDEX IF NOT EXISTS idx_project_documents_user ON project_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_entity ON project_documents(entity_id);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their project documents"
  ON project_documents FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
