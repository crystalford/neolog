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
