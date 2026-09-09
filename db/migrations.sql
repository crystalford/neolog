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
-- transcode, transcribe, read). The four extraction passes it also recorded
-- — threads, clip_candidates, creative_elements, entities — went on 8 Sep.
-- Lets the operator see exactly what worked + what didn't without scrolling
-- Cloudflare dashboards. Shape:
--   {"thumbnail":{"ok":true,"method":"direct","ms":1834},
--    "transcode":{"ok":false,"error":"..."}}
ALTER TABLE vlogs ADD COLUMN extraction_outcomes TEXT;

-- 2026-05-13: chat surface — REMOVED 9 Sep 2026.
--
-- ⚠️ This created `chat_threads`, `chat_messages` and `chat_attachments`,
-- three of the twenty-five tables dropped on 8 Sep with the video-essay
-- studio. The bootstrap workflow applies this file on EVERY deploy, so
-- `POST /api/v2/admin/reset-to-recordings` dropped them and the next push
-- created them again, empty. The same reasoning already recorded for
-- `db/schema.sql` in CLAUDE.md — "because the bootstrap re-applies the
-- schema on every run and would otherwise bring them back empty" — and this
-- file was missed.
--
-- A dropped table coming back means a generator came back with it.
-- `scripts/check-dropped-tables.mjs` now reads db/*.sql too.

-- 2026-05-13: operator_settings — key/value preferences readable from both
-- the client (Settings UI) and the server. The three keys it was created for
-- — a chat default model, an extraction backbone and an extraction tier —
-- all went with the extraction engine on 8 Sep; the table stays because
-- `/settings` writes to it and it is not one of the twenty-five.
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
