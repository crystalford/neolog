-- Neolog — Cloudflare D1 schema (SQLite).
-- Single-operator app. Authentication via Cloudflare Access. No RLS.
-- Every query MUST filter by the operator identity (email from Access JWT)
-- in application code. Service-token-authenticated Workers see all rows.
--
-- This is the canonical schema, written fresh from filament-update/NEOLOG_SCHEMA.md
-- and adapted from Postgres → SQLite:
--   * uuid → TEXT (caller generates ULIDs / UUIDs)
--   * jsonb → TEXT (parsed as JSON in code)
--   * timestamptz → INTEGER (unix epoch ms) or TEXT (ISO 8601). We use TEXT ISO.
--   * boolean → INTEGER (0/1)
--   * enum → TEXT with CHECK constraint
--
-- Conventions:
--   * Every table has `created_at` and `updated_at` (TEXT, ISO 8601 UTC, default CURRENT_TIMESTAMP).
--   * Soft delete via `deleted_at TEXT NULL` on operator-facing tables.
--   * Indexes listed per table.
--   * Foreign keys are declared; cascade behavior follows the spec.
--   * Every CREATE statement uses IF NOT EXISTS so re-running the schema
--     against a partially-applied D1 is safe and idempotent.
--
-- Note: PRAGMA statements are NOT included. D1's remote execute path returns
-- `not authorized: SQLITE_AUTH` on any PRAGMA. D1 has foreign keys enabled
-- by default; journal_mode is managed by Cloudflare.

-- =============================================================================
-- 1. Operator identity
-- =============================================================================

CREATE TABLE IF NOT EXISTS operator (
  id                        TEXT PRIMARY KEY,
  email                     TEXT UNIQUE NOT NULL,
  display_name              TEXT,
  handle                    TEXT UNIQUE,
  bio                       TEXT,
  background                TEXT,
  current_focus             TEXT,
  tz                        TEXT DEFAULT 'America/Toronto',
  -- default_voice_profile_id removed 9 Sep: it pointed at `voice_profiles`,
  -- dropped on 8 Sep with voice cloning. The 2026-xx migration that added it
  -- is append-only and still runs, so an existing database keeps the column;
  -- this file is what a FRESH one is built from, and it should not name a
  -- feature that does not exist.
  public_share_enabled      INTEGER NOT NULL DEFAULT 0,
  created_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operator_email ON operator(email);


-- =============================================================================
-- 2. Capture substrate
-- =============================================================================

CREATE TABLE IF NOT EXISTS vlogs (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  r2_key                   TEXT NOT NULL,
  original_filename        TEXT,
  file_size_bytes          INTEGER,
  mime_type                TEXT,
  duration_seconds         REAL,
  recorded_at              TEXT,
  recorded_at_source       TEXT CHECK (recorded_at_source IN ('pre_extracted','mvhd','filename','upload_time_default','manual')),
  uploaded_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  thumbnail_url            TEXT,
  thumbnail_r2_key         TEXT,
  transcoded_r2_key        TEXT,
  transcript_text          TEXT,
  transcript_provider      TEXT CHECK (transcript_provider IN ('workers_ai_whisper','manual')),
  transcript_completed_at  TEXT,
  pipeline_status          TEXT NOT NULL DEFAULT 'uploaded' CHECK (pipeline_status IN ('uploaded','transcoding','transcribing','extracting','complete','archived','failed')),
  pipeline_error           TEXT,
  extraction_outcomes      TEXT,
  visibility               TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  is_podcast               INTEGER NOT NULL DEFAULT 0,
  slideshow_frames_json    TEXT,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vlogs_operator ON vlogs(operator_id);
CREATE INDEX IF NOT EXISTS idx_vlogs_recorded_at ON vlogs(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vlogs_pipeline_status ON vlogs(pipeline_status);
CREATE INDEX IF NOT EXISTS idx_vlogs_r2_key ON vlogs(r2_key);
CREATE INDEX IF NOT EXISTS idx_vlogs_is_podcast
  ON vlogs(operator_id, is_podcast, recorded_at DESC)
  WHERE is_podcast = 1 AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS transcript_words (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  vlog_id                  TEXT NOT NULL REFERENCES vlogs(id) ON DELETE CASCADE,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  word                     TEXT NOT NULL,
  start_time               REAL NOT NULL,
  end_time                 REAL NOT NULL,
  word_index               INTEGER NOT NULL,
  speaker                  TEXT,
  UNIQUE(vlog_id, word_index)
);
CREATE INDEX IF NOT EXISTS idx_transcript_words_vlog ON transcript_words(vlog_id);
CREATE INDEX IF NOT EXISTS idx_transcript_words_vlog_time ON transcript_words(vlog_id, start_time);


CREATE TABLE IF NOT EXISTS attachments (
  id                       TEXT PRIMARY KEY,
  operator_id              TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
  r2_key                   TEXT NOT NULL,
  original_filename        TEXT,
  file_size_bytes          INTEGER,
  mime_type                TEXT,
  kind                     TEXT CHECK (kind IN ('pdf','image','screenshot','article','document')),
  extracted_text           TEXT,
  recorded_at              TEXT,
  uploaded_at              TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attached_to_kind         TEXT CHECK (attached_to_kind IN ('cluster','project') OR attached_to_kind IS NULL),
  attached_to_id           TEXT,
  deleted_at               TEXT,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_attachments_operator ON attachments(operator_id);
CREATE INDEX IF NOT EXISTS idx_attachments_attached_to ON attachments(attached_to_kind, attached_to_id);

-- =============================================================================
-- 3. Extraction outputs — graph nodes
-- =============================================================================






-- =============================================================================
-- =============================================================================






-- =============================================================================
-- =============================================================================



-- =============================================================================
-- 6. Productions
-- =============================================================================






-- =============================================================================
-- 7. Projects (creative_work containers)
-- =============================================================================



-- =============================================================================
-- 8. Surfaced cards
-- =============================================================================


-- =============================================================================
-- 9. Posts
-- =============================================================================


-- =============================================================================
-- 10. System / pipelines / audit
-- =============================================================================



CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id                       TEXT PRIMARY KEY,
  workflow_id              TEXT,
  job_kind                 TEXT NOT NULL,
  payload                  TEXT,
  state                    TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','complete','failed')),
  started_at               TEXT,
  completed_at             TEXT,
  error                    TEXT,
  retry_count              INTEGER NOT NULL DEFAULT 0,
  created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_state ON pipeline_jobs(state);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_kind ON pipeline_jobs(job_kind);
CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_workflow ON pipeline_jobs(workflow_id);
