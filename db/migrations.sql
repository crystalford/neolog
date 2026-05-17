-- Idempotent migrations for D1.
--
-- This file applies ALTER statements that wouldn't fit cleanly into schema.sql
-- (which is CREATE TABLE IF NOT EXISTS — no help when adding columns to
-- existing tables). The bootstrap workflow applies this AFTER schema.sql
-- with shell-level error suppression so re-runs are safe even when a
-- statement fails because the column/index already exists.

-- 2026-05-12: thumbnail_r2_key — switching from data: URI in thumbnail_url
-- to static JPEG in R2 (key like {operator_id}/thumbs/{vlog_id}.jpg).
-- Original thumbnail_url column stays for legacy data-URI rows.
ALTER TABLE vlogs ADD COLUMN thumbnail_r2_key TEXT;
CREATE INDEX IF NOT EXISTS idx_vlogs_thumbnail_r2_key ON vlogs(thumbnail_r2_key);

-- 2026-05-12: extraction_outcomes — JSON record of per-step results from the
-- post-upload workflow. One key per pipeline step (thumbnail, recorded_at,
-- transcode, transcribe, threads, clip_candidates, creative_elements, entities).
-- Lets the operator see exactly what worked + what didn't without scrolling
-- Cloudflare dashboards. Shape:
--   {"thumbnail":{"ok":true,"method":"direct","ms":1834},
--    "transcode":{"ok":false,"error":"..."}}
ALTER TABLE vlogs ADD COLUMN extraction_outcomes TEXT;

-- 2026-05-13: chat surface — Kimi K2.6 on Workers AI (default) or Claude
-- Sonnet (opt-in 'max'). Each chat_thread is a single conversation; messages
-- are appended in order. tool_calls / tool_results are stored as JSON inside
-- the messages.content_json column so we can replay multi-step tool loops.
CREATE TABLE IF NOT EXISTS chat_threads (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  title       TEXT,
  model       TEXT NOT NULL DEFAULT 'kimi',  -- 'kimi' | 'claude'
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_threads_operator ON chat_threads(operator_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL,
  operator_id  TEXT NOT NULL,
  role         TEXT NOT NULL,                -- 'user' | 'assistant' | 'tool'
  -- For plain text: stored here directly.
  -- For multimodal/tool: content_json holds the full structured content.
  content      TEXT,
  content_json TEXT,
  tool_calls   TEXT,                          -- JSON array when assistant calls tools
  tool_call_id TEXT,                          -- For role='tool' messages
  tool_name    TEXT,                          -- For role='tool' messages
  model        TEXT,                          -- Which model produced this (assistant only)
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at);

-- 2026-05-13: chat_attachments — images / docs pasted into a chat. Stored in
-- R2 at `{operator_id}/chat/{thread_id}/{attachment_id}.{ext}`. Referenced by
-- a chat_messages row via content_json.
CREATE TABLE IF NOT EXISTS chat_attachments (
  id          TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL,
  thread_id   TEXT,
  message_id  TEXT,
  kind        TEXT NOT NULL,                  -- 'image' | 'text' | 'pdf'
  filename    TEXT,
  mime_type   TEXT,
  size_bytes  INTEGER,
  r2_key      TEXT,                            -- For binary blobs
  text_body   TEXT,                            -- For pasted text / extracted doc text
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_thread ON chat_attachments(thread_id, created_at);

-- 2026-05-13: operator_settings — key/value preferences readable from both
-- the client (Settings UI) and the server (extraction passes, chat endpoint).
-- Known keys:
--   chat_default_model      'scout' | 'kimi' | 'claude'   (chatbot default)
--   extraction_workers_model '@cf/...'                    (free-tier backbone)
--   extraction_default_tier 'free' | 'premium' | 'max'    (auto-process tier)
CREATE TABLE IF NOT EXISTS operator_settings (
  operator_id TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (operator_id, key)
);

-- 2026-05-17: reliability overhaul.
-- audio_chunks_json: JSON array of {r2_key, start_sec, end_sec, bytes} written
-- by the browser-side audio extractor at upload time. When set, the transcribe
-- step skips FFmpeg and reads chunks straight from R2 for Whisper.
ALTER TABLE vlogs ADD COLUMN audio_chunks_json TEXT;

-- pipeline_restart_count: incremented by the auto-healing cron worker each
-- time it re-dispatches a stuck workflow. After 3 it marks the row failed
-- so the operator sees genuine failures, not silently-looping retries.
ALTER TABLE vlogs ADD COLUMN pipeline_restart_count INTEGER NOT NULL DEFAULT 0;

-- background_jobs: durable queue for batch backfills (fix-thumbnail,
-- extract-audio, backfill-recorded-at). Status persists across browser
-- refreshes — UI polls this table instead of holding state in React.
CREATE TABLE IF NOT EXISTS background_jobs (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  vlog_id      TEXT,
  operator_id  TEXT NOT NULL,
  status       TEXT CHECK(status IN ('queued','running','done','failed')) NOT NULL DEFAULT 'queued',
  attempts     INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  result_json  TEXT,
  payload_json TEXT,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at   TIMESTAMP,
  completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_jobs_operator_status ON background_jobs(operator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_kind_status ON background_jobs(kind, status);

-- schema_migrations: bookkeeping for the runtime migration runner in
-- src/lib/migration-runner.ts. The runner SELECTs from this on Worker
-- cold-start and applies any MIGRATIONS[] entries not present.
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
