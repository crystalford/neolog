/**
 * Idempotent D1 migration runner.
 *
 * Runs on every Pages Worker cold start (per-isolate, memoized) so new
 * columns/tables defined here are guaranteed to exist before any /api/v2/*
 * route touches D1. Replaces the manual "Run D1 migrations" button.
 *
 * Each entry is one DDL statement applied once. We track applied names in
 * `schema_migrations` so re-runs are cheap (one indexed SELECT). For older
 * databases that already have a column/table the statement would create,
 * we additionally swallow "duplicate column" / "already exists" errors —
 * the bookkeeping then records the migration as applied so future runs skip.
 *
 * To add a new migration: append a new `{ name, sql }` entry below. Pick a
 * unique name (date-prefix recommended). NEVER edit or remove an existing
 * entry — that breaks deploys where the row already exists in
 * `schema_migrations` and the new SQL is never run.
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface Migration {
  name: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    name: '2026-05-12_vlogs_thumbnail_r2_key',
    sql: `ALTER TABLE vlogs ADD COLUMN thumbnail_r2_key TEXT`,
  },
  {
    name: '2026-05-12_idx_vlogs_thumbnail_r2_key',
    sql: `CREATE INDEX IF NOT EXISTS idx_vlogs_thumbnail_r2_key ON vlogs(thumbnail_r2_key)`,
  },
  {
    name: '2026-05-12_vlogs_extraction_outcomes',
    sql: `ALTER TABLE vlogs ADD COLUMN extraction_outcomes TEXT`,
  },
  {
    name: '2026-05-13_chat_threads',
    sql: `CREATE TABLE IF NOT EXISTS chat_threads (
      id          TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      title       TEXT,
      model       TEXT NOT NULL DEFAULT 'kimi',
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted_at  TIMESTAMP
    )`,
  },
  {
    name: '2026-05-13_idx_chat_threads_operator',
    sql: `CREATE INDEX IF NOT EXISTS idx_chat_threads_operator ON chat_threads(operator_id, updated_at DESC)`,
  },
  {
    name: '2026-05-13_chat_messages',
    sql: `CREATE TABLE IF NOT EXISTS chat_messages (
      id            TEXT PRIMARY KEY,
      thread_id     TEXT NOT NULL,
      operator_id   TEXT NOT NULL,
      role          TEXT NOT NULL,
      content       TEXT,
      content_json  TEXT,
      tool_calls    TEXT,
      tool_call_id  TEXT,
      tool_name     TEXT,
      model         TEXT,
      input_tokens  INTEGER,
      output_tokens INTEGER,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: '2026-05-13_idx_chat_messages_thread',
    sql: `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at)`,
  },
  {
    name: '2026-05-13_chat_attachments',
    sql: `CREATE TABLE IF NOT EXISTS chat_attachments (
      id          TEXT PRIMARY KEY,
      operator_id TEXT NOT NULL,
      thread_id   TEXT,
      message_id  TEXT,
      kind        TEXT NOT NULL,
      filename    TEXT,
      mime_type   TEXT,
      size_bytes  INTEGER,
      r2_key      TEXT,
      text_body   TEXT,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: '2026-05-13_idx_chat_attachments_thread',
    sql: `CREATE INDEX IF NOT EXISTS idx_chat_attachments_thread ON chat_attachments(thread_id, created_at)`,
  },
  {
    name: '2026-05-13_operator_settings',
    sql: `CREATE TABLE IF NOT EXISTS operator_settings (
      operator_id TEXT NOT NULL,
      key         TEXT NOT NULL,
      value       TEXT,
      updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (operator_id, key)
    )`,
  },
  // ─── Reliability overhaul migrations ──────────────────────────────────────
  {
    name: '2026-05-17_vlogs_audio_chunks_json',
    sql: `ALTER TABLE vlogs ADD COLUMN audio_chunks_json TEXT`,
  },
  {
    name: '2026-05-17_vlogs_pipeline_restart_count',
    sql: `ALTER TABLE vlogs ADD COLUMN pipeline_restart_count INTEGER NOT NULL DEFAULT 0`,
  },
  {
    name: '2026-05-17_background_jobs',
    sql: `CREATE TABLE IF NOT EXISTS background_jobs (
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
    )`,
  },
  {
    name: '2026-05-17_idx_jobs_operator_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_jobs_operator_status ON background_jobs(operator_id, status, created_at DESC)`,
  },
  {
    name: '2026-05-17_idx_jobs_kind_status',
    sql: `CREATE INDEX IF NOT EXISTS idx_jobs_kind_status ON background_jobs(kind, status)`,
  },
  // ─── pipeline_events: single source of truth for "what happened to a vlog" ─
  // Replaces the truncated extraction_outcomes JSON column. Every step of the
  // pipeline writes a row here with full untruncated error text, timestamps,
  // and the build version of the worker that ran it. UI and AI assistant read
  // from this directly instead of guessing from cryptic upstream 503s.
  {
    name: '2026-05-18_pipeline_events',
    sql: `CREATE TABLE IF NOT EXISTS pipeline_events (
      id              TEXT PRIMARY KEY,
      vlog_id         TEXT NOT NULL,
      operator_id     TEXT NOT NULL,
      step            TEXT NOT NULL,
      status          TEXT NOT NULL CHECK (status IN ('started','ok','failed','skipped')),
      runtime         TEXT,
      worker_version  TEXT,
      request_id      TEXT,
      started_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at    TIMESTAMP,
      duration_ms     INTEGER,
      error_full_text TEXT,
      detail_json     TEXT
    )`,
  },
  {
    name: '2026-05-18_idx_pipeline_events_vlog',
    sql: `CREATE INDEX IF NOT EXISTS idx_pipeline_events_vlog ON pipeline_events(vlog_id, started_at DESC)`,
  },
  {
    name: '2026-05-18_idx_pipeline_events_operator_failed',
    sql: `CREATE INDEX IF NOT EXISTS idx_pipeline_events_operator_failed ON pipeline_events(operator_id, status, started_at DESC) WHERE status = 'failed'`,
  },
  // ─── pipeline_events: add columns the new DO-driven flow writes ──────────
  // The original table had a CHECK(status IN 'started','ok','failed','skipped')
  // constraint that's too narrow for the DO's richer status set ('starting',
  // 'running','retrying','failed_terminal','error'). Rather than recreate the
  // table (D1 doesn't have a clean DROP CONSTRAINT), the DO maps its rich
  // status into one of the allowed values and stuffs the full status into
  // detail_json.state for the UI to read.
  {
    name: '2026-05-18_pipeline_events_sub_step',
    sql: `ALTER TABLE pipeline_events ADD COLUMN sub_step TEXT`,
  },
  {
    name: '2026-05-18_pipeline_events_ts',
    sql: `ALTER TABLE pipeline_events ADD COLUMN ts INTEGER`,
  },
  {
    name: '2026-05-18_pipeline_events_attempt',
    sql: `ALTER TABLE pipeline_events ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1`,
  },
  // ─── unified extraction runs ─────────────────────────────────────────────
  // One row per extraction RUN (a single LLM call producing all 4 output types).
  // The `is_active=1` row is the one whose threads/clips/creative_elements/entities
  // rows are visible in the UI. Older runs stay around so the operator can
  // compare what different models / prompt versions produced.
  {
    name: '2026-05-18_extraction_runs',
    sql: `CREATE TABLE IF NOT EXISTS extraction_runs (
      id              TEXT PRIMARY KEY,
      vlog_id         TEXT NOT NULL,
      operator_id     TEXT NOT NULL,
      model           TEXT NOT NULL,
      escalated_from  TEXT,
      mode            TEXT NOT NULL,
      r2_key          TEXT NOT NULL,
      total_items     INTEGER NOT NULL DEFAULT 0,
      invalid_items   INTEGER NOT NULL DEFAULT 0,
      fail_rate       REAL NOT NULL DEFAULT 0,
      cost_usd_input  REAL,
      cost_usd_output REAL,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL
    )`,
  },
  {
    name: '2026-05-18_idx_extraction_runs_vlog_active',
    sql: `CREATE INDEX IF NOT EXISTS idx_extraction_runs_vlog_active ON extraction_runs(vlog_id, is_active)`,
  },
  // ─── vlogs.state ─ simpler state machine for the new pipeline ────────────
  // Coexists with pipeline_status during cutover. The DO writes both for now;
  // future commit drops pipeline_status.
  {
    name: '2026-05-18_vlogs_state',
    sql: `ALTER TABLE vlogs ADD COLUMN state TEXT NOT NULL DEFAULT 'queued'`,
  },
  {
    name: '2026-05-18_vlogs_state_error',
    sql: `ALTER TABLE vlogs ADD COLUMN state_error TEXT`,
  },
  {
    name: '2026-05-18_vlogs_extraction_mode',
    sql: `ALTER TABLE vlogs ADD COLUMN extraction_mode TEXT NOT NULL DEFAULT 'auto'`,
  },
  {
    name: '2026-05-18_idx_vlogs_state',
    sql: `CREATE INDEX IF NOT EXISTS idx_vlogs_state ON vlogs(state)`,
  },
  // ─── threads/clips/creative_elements: link to extraction_runs ────────────
  // Schema additions are nullable so existing rows aren't disturbed. New
  // unified extraction populates these; legacy extraction leaves them NULL.
  {
    name: '2026-05-18_threads_run_id',
    sql: `ALTER TABLE threads ADD COLUMN run_id TEXT`,
  },
  {
    name: '2026-05-18_threads_validated',
    sql: `ALTER TABLE threads ADD COLUMN validated INTEGER NOT NULL DEFAULT 1`,
  },
  {
    name: '2026-05-18_clip_candidates_run_id',
    sql: `ALTER TABLE clip_candidates ADD COLUMN run_id TEXT`,
  },
  {
    name: '2026-05-18_clip_candidates_validated',
    sql: `ALTER TABLE clip_candidates ADD COLUMN validated INTEGER NOT NULL DEFAULT 1`,
  },
  {
    name: '2026-05-18_creative_elements_run_id',
    sql: `ALTER TABLE creative_elements ADD COLUMN run_id TEXT`,
  },
  {
    name: '2026-05-18_creative_elements_validated',
    sql: `ALTER TABLE creative_elements ADD COLUMN validated INTEGER NOT NULL DEFAULT 1`,
  },
  // ─── extraction_runs reshape ─────────────────────────────────────────────
  // db/schema.sql created an `extraction_runs` table with the legacy 4-pass
  // shape (pass, prompt_version, output_count, cost_usd) and a NOT NULL CHECK
  // on `pass`. The 2026-05-18_extraction_runs migration was a no-op against
  // it because CREATE TABLE IF NOT EXISTS doesn't reshape existing tables —
  // so the unified-extraction INSERTs fail with `no such column: is_active`
  // and `pass cannot be null`.
  //
  // Fix: drop + recreate with the unified-extraction shape. Legacy data is
  // discarded; in practice the table was empty (the old extract flow never
  // got far enough to write rows in production). The threads / clip_candidates
  // / creative_elements rows may have run_id values that now orphan; the new
  // queries treat them as is_active = 0 (filtered out) which is fine.
  {
    name: '2026-05-19_drop_extraction_runs_legacy',
    sql: `DROP TABLE IF EXISTS extraction_runs`,
  },
  {
    name: '2026-05-19_extraction_runs_v2',
    sql: `CREATE TABLE IF NOT EXISTS extraction_runs (
      id              TEXT PRIMARY KEY,
      vlog_id         TEXT NOT NULL,
      operator_id     TEXT NOT NULL,
      model           TEXT NOT NULL,
      escalated_from  TEXT,
      mode            TEXT NOT NULL,
      r2_key          TEXT NOT NULL,
      total_items     INTEGER NOT NULL DEFAULT 0,
      invalid_items   INTEGER NOT NULL DEFAULT 0,
      fail_rate       REAL NOT NULL DEFAULT 0,
      cost_usd_input  REAL,
      cost_usd_output REAL,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL
    )`,
  },
  {
    name: '2026-05-19_idx_extraction_runs_vlog_v2',
    sql: `CREATE INDEX IF NOT EXISTS idx_extraction_runs_vlog ON extraction_runs(vlog_id)`,
  },
  {
    name: '2026-05-19_idx_extraction_runs_active_v2',
    sql: `CREATE INDEX IF NOT EXISTS idx_extraction_runs_active ON extraction_runs(vlog_id, is_active)`,
  },
  // ─── vlogs.summary ──────────────────────────────────────────────────────
  // 60-120 word summary produced by the unified extraction. Shown at the top
  // of /timeline/[id] between metadata and transcript so the operator gets
  // an instant sense of what the vlog is about without scrolling.
  {
    name: '2026-05-19_vlogs_summary',
    sql: `ALTER TABLE vlogs ADD COLUMN summary TEXT`,
  },
  // ─── entities.vlog_id / entities.run_id ─────────────────────────────────
  // Original schema scoped entities by operator_id only (entity_mentions
  // joined back to source). The unified extraction worker writes
  // `entities (id, operator_id, vlog_id, run_id, ...)` directly per-vlog;
  // without these columns the batch INSERT silently fails and the vlog
  // detail API 500s on `WHERE vlog_id = ?`. Nullable — legacy mention-based
  // rows stay valid with vlog_id NULL.
  {
    name: '2026-05-19_entities_vlog_id',
    sql: `ALTER TABLE entities ADD COLUMN vlog_id TEXT`,
  },
  {
    name: '2026-05-19_entities_run_id',
    sql: `ALTER TABLE entities ADD COLUMN run_id TEXT`,
  },
  {
    name: '2026-05-19_idx_entities_vlog',
    sql: `CREATE INDEX IF NOT EXISTS idx_entities_vlog ON entities(vlog_id)`,
  },
  // ─── clip_candidates / creative_elements .extracted_at ───────────────────
  // Both extraction workers INSERT an `extracted_at` value at the end of the
  // column list. The base schema only has created_at/updated_at on these
  // tables, so the INSERTs were silently failing inside the chunk-batch
  // try/catch — every run reported success while persisting zero clip
  // and creative_element rows. Defaulted so historical rows stay valid.
  {
    name: '2026-05-19_clip_candidates_extracted_at',
    sql: `ALTER TABLE clip_candidates ADD COLUMN extracted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  },
  {
    name: '2026-05-19_creative_elements_extracted_at',
    sql: `ALTER TABLE creative_elements ADD COLUMN extracted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  },
  // ─── vlogs.extraction_mode vocabulary cleanup ────────────────────────────
  // Earlier the picker offered free/auto/premium/max. Operator collapsed
  // to two: cheap | premium. Backfill stragglers so the picker never has
  // to render an unknown chip.
  {
    name: '2026-05-19_extraction_mode_cheap',
    sql: `UPDATE vlogs SET extraction_mode = 'cheap' WHERE extraction_mode IN ('auto', 'free')`,
  },
  // key_phrases — short 2-8 word phrases the LLM marks as the punchiest
  // fragments inside the take. Used by the Thread detail page to
  // marker-highlight them in the hero h1, the take pull-quote, and the
  // transcript span. Nullable; old rows stay NULL until re-extracted.
  {
    name: '2026-05-20_threads_key_phrases',
    sql: `ALTER TABLE threads ADD COLUMN key_phrases TEXT`,
  },
  // ─── Unification: threads absorb clip_candidates + creative_elements ──────
  // Operator decision (2026-05-22): "threads are clips ... and creative
  // elements should just be threads with a wider register." Drop the CHECK
  // on threads.register, add clip-flag columns, backfill the two side
  // tables, soft-delete the originals. See chat log for the rationale.
  {
    name: '2026-05-22_threads_rebuild_create_new',
    sql: `CREATE TABLE IF NOT EXISTS threads_new (
      id                          TEXT PRIMARY KEY,
      operator_id                 TEXT NOT NULL,
      vlog_id                     TEXT NOT NULL,
      topic                       TEXT NOT NULL,
      take                        TEXT,
      key_quotes                  TEXT,
      questions_raised            TEXT,
      key_phrases                 TEXT,
      register                    TEXT,
      strength                    INTEGER,
      transcript_span_start       REAL,
      transcript_span_end         REAL,
      abstracted_topic            TEXT,
      clippable                   INTEGER NOT NULL DEFAULT 0,
      clip_headline               TEXT,
      clip_reason                 TEXT,
      run_id                      TEXT,
      validated                   INTEGER NOT NULL DEFAULT 1,
      extraction_prompt_version   TEXT NOT NULL,
      extracted_at                TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cluster_id                  TEXT,
      deleted_at                  TEXT,
      created_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: '2026-05-22_threads_rebuild_copy',
    sql: `INSERT OR IGNORE INTO threads_new
      (id, operator_id, vlog_id, topic, take, key_quotes, questions_raised,
       key_phrases, register, strength, transcript_span_start, transcript_span_end,
       abstracted_topic, run_id, validated, extraction_prompt_version,
       extracted_at, cluster_id, deleted_at, created_at, updated_at)
      SELECT id, operator_id, vlog_id, topic, take, key_quotes, questions_raised,
             key_phrases, register, strength, transcript_span_start, transcript_span_end,
             abstracted_topic, run_id, validated, extraction_prompt_version,
             extracted_at, cluster_id, deleted_at, created_at, updated_at
        FROM threads`,
  },
  {
    name: '2026-05-22_threads_rebuild_drop_old',
    sql: `DROP TABLE IF EXISTS threads`,
  },
  {
    name: '2026-05-22_threads_rebuild_rename',
    sql: `ALTER TABLE threads_new RENAME TO threads`,
  },
  {
    name: '2026-05-22_threads_rebuild_idx_operator',
    sql: `CREATE INDEX IF NOT EXISTS idx_threads_operator ON threads(operator_id)`,
  },
  {
    name: '2026-05-22_threads_rebuild_idx_vlog',
    sql: `CREATE INDEX IF NOT EXISTS idx_threads_vlog ON threads(vlog_id)`,
  },
  {
    name: '2026-05-22_threads_rebuild_idx_abstracted',
    sql: `CREATE INDEX IF NOT EXISTS idx_threads_abstracted_topic ON threads(abstracted_topic)`,
  },
  {
    name: '2026-05-22_threads_rebuild_idx_strength',
    sql: `CREATE INDEX IF NOT EXISTS idx_threads_strength ON threads(operator_id, strength DESC)`,
  },
  {
    name: '2026-05-22_threads_rebuild_idx_cluster',
    sql: `CREATE INDEX IF NOT EXISTS idx_threads_cluster ON threads(cluster_id)`,
  },
  {
    name: '2026-05-22_threads_rebuild_idx_clippable',
    sql: `CREATE INDEX IF NOT EXISTS idx_threads_clippable ON threads(operator_id, clippable)`,
  },
  // Backfill creative_elements → threads. The element_type becomes the
  // widened register; content becomes the take. We synthesize a topic
  // from the element_type prefix. key_quotes is an empty JSON array
  // because creative_elements never had quote arrays.
  {
    name: '2026-05-22_backfill_creatives_into_threads',
    sql: `INSERT OR IGNORE INTO threads
      (id, operator_id, vlog_id, topic, take, key_quotes, register,
       transcript_span_start, transcript_span_end,
       extraction_prompt_version, extracted_at, created_at, updated_at)
      SELECT id, operator_id, vlog_id,
             'Creative · ' || element_type,
             COALESCE(content, ''),
             '[]',
             element_type,
             transcript_span_start, transcript_span_end,
             extraction_prompt_version,
             COALESCE(extracted_at, created_at),
             created_at, COALESCE(updated_at, created_at)
        FROM creative_elements
       WHERE deleted_at IS NULL`,
  },
  // Backfill clip_candidates → threads with clippable=1. We synthesize
  // a key_quotes JSON array from the quote field via json_array() so
  // downstream voice-grounding checks still pass.
  {
    name: '2026-05-22_backfill_clips_into_threads',
    sql: `INSERT OR IGNORE INTO threads
      (id, operator_id, vlog_id, topic, take, key_quotes, register,
       transcript_span_start, transcript_span_end,
       clippable, clip_headline, clip_reason,
       extraction_prompt_version, extracted_at, created_at, updated_at)
      SELECT id, operator_id, vlog_id,
             headline,
             COALESCE(quote, headline),
             CASE WHEN quote IS NOT NULL AND quote <> ''
                  THEN json_array(quote)
                  ELSE '[]' END,
             'observation',
             start_time, end_time,
             1, headline, why_clippable,
             extraction_prompt_version,
             COALESCE(extracted_at, created_at),
             created_at, COALESCE(updated_at, created_at)
        FROM clip_candidates
       WHERE deleted_at IS NULL`,
  },
  {
    name: '2026-05-22_soft_delete_creatives',
    sql: `UPDATE creative_elements SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`,
  },
  {
    name: '2026-05-22_soft_delete_clips',
    sql: `UPDATE clip_candidates SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`,
  },
  // ─── vlogs.title — short AI-derived headline ─────────────────────────────
  // Replaces the meaningless DJI filename as the display title on the vlog
  // hero and Timeline cards. 3-8 words, voice-flavored. Filename remains
  // available in the meta strip + as original_filename for dedup.
  {
    name: '2026-05-22_vlogs_title',
    sql: `ALTER TABLE vlogs ADD COLUMN title TEXT`,
  },
  // ─── podcast feed inclusion (2026-06-04) ─────────────────────────────────
  // Per-vlog opt-in flag for /podcast.xml. Independent of visibility=public
  // so the operator can curate the podcast feed separately from the web
  // archive (e.g. include audio-only quick takes that aren't web-public).
  {
    name: '2026-06-04_vlogs_is_podcast',
    sql: `ALTER TABLE vlogs ADD COLUMN is_podcast INTEGER NOT NULL DEFAULT 0`,
  },
  {
    name: '2026-06-04_idx_vlogs_is_podcast',
    sql: `CREATE INDEX IF NOT EXISTS idx_vlogs_is_podcast
            ON vlogs(operator_id, is_podcast, recorded_at DESC)
            WHERE is_podcast = 1 AND deleted_at IS NULL`,
  },
  // ─── slideshow upload mode (2026-06-04) ──────────────────────────────────
  // Bad-wifi mode #3: client extracts N still frames (every ~5s) + the
  // streaming audio; vlog page renders the stills timed to the audio. No
  // video upload. JSON shape: [{ r2_key, time_sec }]
  {
    name: '2026-06-04_vlogs_slideshow_frames_json',
    sql: `ALTER TABLE vlogs ADD COLUMN slideshow_frames_json TEXT`,
  },
  // ─── Typed utterances (2026-06-11, Phase 2) ──────────────────────────────
  // Each thread carries a structural kind so scripts can compose a real arc
  // (claim → story → open_question) instead of a flat collage of takes.
  // Distinct from `register` (voice mode). Old rows stay NULL and are
  // treated as 'observation' by downstream consumers.
  {
    name: '2026-06-11_threads_utterance_kind',
    sql: `ALTER TABLE threads ADD COLUMN utterance_kind TEXT`,
  },
  {
    name: '2026-06-11_idx_threads_utterance_kind',
    sql: `CREATE INDEX IF NOT EXISTS idx_threads_utterance_kind
            ON threads(operator_id, utterance_kind)
            WHERE utterance_kind IS NOT NULL AND deleted_at IS NULL`,
  },
  // ─── Subject kinds: theme / tension / evolution / open_loop (Phase 3) ────
  // Tensions and evolutions are FIRST-CLASS subjects alongside themes — the
  // contradictions and changes-of-mind the operator lives are the best
  // essay seeds. pole_a/pole_b carry the two sides (with dates) so the
  // subject card and script generator can render "on {date_a} you said X;
  // on {date_b} the opposite."
  {
    name: '2026-06-11_clusters_subject_kind',
    sql: `ALTER TABLE clusters ADD COLUMN subject_kind TEXT`,
  },
  {
    name: '2026-06-11_clusters_pole_a',
    sql: `ALTER TABLE clusters ADD COLUMN pole_a TEXT`,
  },
  {
    name: '2026-06-11_clusters_pole_b',
    sql: `ALTER TABLE clusters ADD COLUMN pole_b TEXT`,
  },
  {
    name: '2026-06-11_clusters_pole_a_at',
    sql: `ALTER TABLE clusters ADD COLUMN pole_a_at TEXT`,
  },
  {
    name: '2026-06-11_clusters_pole_b_at',
    sql: `ALTER TABLE clusters ADD COLUMN pole_b_at TEXT`,
  },
  {
    name: '2026-06-11_idx_clusters_subject_kind',
    sql: `CREATE INDEX IF NOT EXISTS idx_clusters_subject_kind
            ON clusters(operator_id, subject_kind, ripeness_score DESC)
            WHERE deleted_at IS NULL`,
  },
  // ─── Phase 4: reasoning skeleton on productions ──────────────────────────
  // Before writing full prose, the system proposes a BEAT STRUCTURE (a
  // skeleton). Operator reviews/locks it, then prose is generated from the
  // locked skeleton. Stored as JSON on productions so the same skeleton can
  // fan out to multiple deliverables (essay → article → post).
  {
    name: '2026-06-11_productions_reasoning_skeleton_json',
    sql: `ALTER TABLE productions ADD COLUMN reasoning_skeleton_json TEXT`,
  },
  {
    name: '2026-06-11_productions_skeleton_locked',
    sql: `ALTER TABLE productions ADD COLUMN skeleton_locked INTEGER NOT NULL DEFAULT 0`,
  },
  // ─── AI b-roll per beat (2026-06-12) ─────────────────────────────────────
  // For each beat: a Flux still + a Wan-2.7 (or Ken-Burns-fallback) clip.
  // broll_status: null → 'image' → 'video' → 'failed'. broll_prompt is
  // stored so regeneration uses the operator's edits and we can audit drift.
  {
    name: '2026-06-12_production_beats_broll_image_r2_key',
    sql: `ALTER TABLE production_beats ADD COLUMN broll_image_r2_key TEXT`,
  },
  {
    name: '2026-06-12_production_beats_broll_video_r2_key',
    sql: `ALTER TABLE production_beats ADD COLUMN broll_video_r2_key TEXT`,
  },
  {
    name: '2026-06-12_production_beats_broll_prompt',
    sql: `ALTER TABLE production_beats ADD COLUMN broll_prompt TEXT`,
  },
  {
    name: '2026-06-12_production_beats_broll_status',
    sql: `ALTER TABLE production_beats ADD COLUMN broll_status TEXT`,
  },
  {
    name: '2026-06-12_production_beats_broll_duration_sec',
    sql: `ALTER TABLE production_beats ADD COLUMN broll_duration_sec REAL`,
  },
  // ─── Voice synthesis (Phase 5) ───────────────────────────────────────────
  // Operator can either record each beat OR synthesize via Cloudflare TTS.
  // MiniMax 2.8 Turbo clones from a 10s reference; Aura-2 / Grok use presets.
  // synth_audio_r2_key lives next to audio_r2_key; stitch picks whichever
  // exists (recorded wins ties — operator's actual voice trumps clone).
  {
    name: '2026-06-12_production_beats_synth_audio_r2_key',
    sql: `ALTER TABLE production_beats ADD COLUMN synth_audio_r2_key TEXT`,
  },
  {
    name: '2026-06-12_production_beats_synth_voice_id',
    sql: `ALTER TABLE production_beats ADD COLUMN synth_voice_id TEXT`,
  },
  {
    name: '2026-06-12_operator_voice_profile_r2_key',
    sql: `ALTER TABLE operator ADD COLUMN voice_profile_r2_key TEXT`,
  },
  {
    name: '2026-06-12_operator_voice_synth_mode',
    sql: `ALTER TABLE operator ADD COLUMN voice_synth_mode TEXT`,
  },
  {
    name: '2026-06-12_operator_voice_synth_voice_id',
    sql: `ALTER TABLE operator ADD COLUMN voice_synth_voice_id TEXT`,
  },
  // Render heartbeat: the render step writes intermediate substeps here so
  // the client poll surfaces "concating audio" / "rendering" / "uploading"
  // instead of a 5-minute silent spinner.
  {
    name: '2026-06-12_productions_render_status',
    sql: `ALTER TABLE productions ADD COLUMN render_status TEXT`,
  },
  {
    name: '2026-06-12_productions_render_started_at',
    sql: `ALTER TABLE productions ADD COLUMN render_started_at TEXT`,
  },
  // ─── Topics surface — essays on arbitrary subjects, in your voice ────────
  // A 'topic' is a free-text subject the operator types (a person, an idea,
  // a fascination). Distinct from 'clusters' which are auto-surfaced from
  // the operator's own vlogs. Stored as its own table so the Subjects screen
  // stays cleanly about reflection while Topics is the create-from-scratch
  // surface. Same production downstream — a Topic generates a video_essay
  // with source_kind='topic', source_id=<topic id>.
  {
    name: '2026-06-12_topics',
    sql: `CREATE TABLE IF NOT EXISTS topics (
      id              TEXT PRIMARY KEY,
      operator_id     TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      framing         TEXT,
      angle           TEXT,
      notes           TEXT,
      state           TEXT NOT NULL DEFAULT 'forming',
      deleted_at      TEXT,
      created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  },
  {
    name: '2026-06-12_idx_topics_operator',
    sql: `CREATE INDEX IF NOT EXISTS idx_topics_operator
            ON topics(operator_id, updated_at DESC)
            WHERE deleted_at IS NULL`,
  },
  // ─── Topic research (the "system goes and learns" pass) ──────────────────
  // Per-topic: the synthesized research brief + a list of URLs used.
  // Sources are stored separately so the operator can audit / remove a
  // source and re-research without losing the topic.
  {
    name: '2026-06-12_topics_research_brief',
    sql: `ALTER TABLE topics ADD COLUMN research_brief TEXT`,
  },
  {
    name: '2026-06-12_topics_research_status',
    sql: `ALTER TABLE topics ADD COLUMN research_status TEXT`,
  },
  {
    name: '2026-06-12_topics_research_at',
    sql: `ALTER TABLE topics ADD COLUMN research_at TEXT`,
  },
  {
    name: '2026-06-12_topics_pasted_urls_json',
    sql: `ALTER TABLE topics ADD COLUMN pasted_urls_json TEXT`,
  },
  {
    name: '2026-06-12_topic_sources',
    sql: `CREATE TABLE IF NOT EXISTS topic_sources (
      id              TEXT PRIMARY KEY,
      topic_id        TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      operator_id     TEXT NOT NULL REFERENCES operator(id) ON DELETE CASCADE,
      url             TEXT NOT NULL,
      title           TEXT,
      summary         TEXT,
      origin          TEXT,
      content_r2_key  TEXT,
      bytes           INTEGER,
      fetched_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      error           TEXT
    )`,
  },
  {
    name: '2026-06-12_idx_topic_sources_topic',
    sql: `CREATE INDEX IF NOT EXISTS idx_topic_sources_topic
            ON topic_sources(topic_id, fetched_at DESC)`,
  },
  // Operator setting: Brave Search API key (optional). When present, the
  // research step auto-searches. When absent, falls back to pasted URLs.
  {
    name: '2026-06-12_operator_brave_search_api_key',
    sql: `ALTER TABLE operator ADD COLUMN brave_search_api_key TEXT`,
  },
  // ─── Operator profile (the "knows me" layer) ─────────────────────────────
  // A synthesized paragraph of WHAT the operator cares about — refreshed
  // from their vlog corpus + named subjects. Injected into every generator
  // (librarian, angle suggester, research brief, script writer) so each
  // act of generation is shaped by the operator's actual mind, not a
  // stranger's.
  {
    name: '2026-06-12_operator_profile_digest',
    sql: `ALTER TABLE operator ADD COLUMN profile_digest TEXT`,
  },
  {
    name: '2026-06-12_operator_profile_refreshed_at',
    sql: `ALTER TABLE operator ADD COLUMN profile_refreshed_at TEXT`,
  },
  // Cache suggestions per topic so they're INSTANT on revisit. Pre-fired
  // on topic create via waitUntil() so the detail page renders them as
  // soon as the page loads, not after a 15s gpt-oss call.
  {
    name: '2026-06-12_topics_suggestions_json',
    sql: `ALTER TABLE topics ADD COLUMN suggestions_json TEXT`,
  },
  {
    name: '2026-06-12_topics_suggestions_grounded',
    sql: `ALTER TABLE topics ADD COLUMN suggestions_grounded INTEGER NOT NULL DEFAULT 0`,
  },
  // ─── Spark seeds cache (Phase 5 polish) ──────────────────────────────────
  // Cached on operator so the Spark composer renders concept seeds
  // instantly. Refreshed on librarian completion (same trigger as the
  // profile digest).
  {
    name: '2026-06-12_operator_spark_seeds_json',
    sql: `ALTER TABLE operator ADD COLUMN spark_seeds_json TEXT`,
  },
  {
    name: '2026-06-12_operator_spark_seeds_refreshed_at',
    sql: `ALTER TABLE operator ADD COLUMN spark_seeds_refreshed_at TEXT`,
  },
  // Production aspect ratio. Shorts render 9:16; everything else 16:9.
  // Drives both the b-roll image/video aspect and the FFmpeg render output.
  {
    name: '2026-06-12_productions_aspect',
    sql: `ALTER TABLE productions ADD COLUMN aspect TEXT`,
  },
  // ─── Subjects / librarian pass (2026-06-04) ──────────────────────────────
  // The librarian writes into the existing `clusters` table (so the
  // production→video-essay flow already works). These columns carry the
  // concept-naming layer: the system identifies the underlying concept a
  // creator keeps circling — even when they never used the term — and
  // records how it named it.
  {
    name: '2026-06-04_clusters_framing',
    sql: `ALTER TABLE clusters ADD COLUMN framing TEXT`,
  },
  {
    name: '2026-06-04_clusters_concept_confidence',
    sql: `ALTER TABLE clusters ADD COLUMN concept_confidence REAL`,
  },
  {
    name: '2026-06-04_clusters_named_by_system',
    sql: `ALTER TABLE clusters ADD COLUMN named_by_system INTEGER NOT NULL DEFAULT 0`,
  },
  {
    name: '2026-06-04_clusters_representative_quote',
    sql: `ALTER TABLE clusters ADD COLUMN representative_quote TEXT`,
  },
  {
    name: '2026-06-04_clusters_subject_source',
    sql: `ALTER TABLE clusters ADD COLUMN subject_source TEXT`,
  },
  {
    name: '2026-06-04_idx_clusters_subject_source',
    sql: `CREATE INDEX IF NOT EXISTS idx_clusters_subject_source
            ON clusters(operator_id, subject_source, ripeness_score DESC)
            WHERE deleted_at IS NULL`,
  },
  // ─── Auto-publish pipeline (2026-06-16) ──────────────────────────────────
  // Per-vlog toggle: when 1, the post-upload workflow auto-promotes the
  // top-N validated clip_candidates into shorts and fires the operator's
  // social-fanout webhook (Make.com / Buffer / etc.). Off by default so
  // existing vlogs don't suddenly start posting.
  {
    name: '2026-06-16_vlogs_auto_publish_clips',
    sql: `ALTER TABLE vlogs ADD COLUMN auto_publish_clips INTEGER NOT NULL DEFAULT 0`,
  },
  // Operator settings for auto-publish defaults.
  {
    name: '2026-06-16_operator_social_fanout_webhook_url',
    sql: `ALTER TABLE operator ADD COLUMN social_fanout_webhook_url TEXT`,
  },
  {
    name: '2026-06-16_operator_auto_publish_default',
    sql: `ALTER TABLE operator ADD COLUMN auto_publish_default INTEGER NOT NULL DEFAULT 0`,
  },
  {
    name: '2026-06-16_operator_auto_publish_max_per_vlog',
    sql: `ALTER TABLE operator ADD COLUMN auto_publish_max_per_vlog INTEGER NOT NULL DEFAULT 2`,
  },
  // Flag set by the post-upload workflow when extraction finishes on an
  // auto-publish-eligible vlog. The Pages app (refresh-drafts cron or
  // home-page visit via ctx.waitUntil) scans for pending=1 and runs
  // autoPromoteVlog. Cleared on success.
  {
    name: '2026-06-16_vlogs_auto_publish_pending',
    sql: `ALTER TABLE vlogs ADD COLUMN auto_publish_pending INTEGER NOT NULL DEFAULT 0`,
  },
  {
    name: '2026-06-16_idx_vlogs_auto_publish_pending',
    sql: `CREATE INDEX IF NOT EXISTS idx_vlogs_auto_publish_pending
            ON vlogs(operator_id, auto_publish_pending)
            WHERE deleted_at IS NULL AND auto_publish_pending = 1`,
  },
  // Optional 9:16 second-output on the auto-publish pipeline. Default 0
  // (off). When 1, the auto-promote step ALSO renders a vertical copy of
  // each shipped clip (FFmpeg crop=ih*9/16:ih,setsar=1) so the same clip
  // can fan out to vertical feeds without a separate manual step.
  {
    name: '2026-06-16_vlogs_auto_publish_vertical',
    sql: `ALTER TABLE vlogs ADD COLUMN auto_publish_vertical INTEGER NOT NULL DEFAULT 0`,
  },
  // ─── Clip-quality judge (2026-06-16) ─────────────────────────────────────
  // Each clip_candidate gets a 1–5 "would this travel as a standalone short"
  // score from a second LLM pass that reads the clip + 30s of pre/post
  // transcript context. Auto-promote requires score >= 4 to ship, so dull
  // candidates never auto-post even if the extractor flagged them.
  // Persisted so re-runs of the sweep don't re-judge — judging is the
  // expensive step (one gpt-oss low-effort call per candidate).
  {
    name: '2026-06-16_clip_candidates_clippability_score',
    sql: `ALTER TABLE clip_candidates ADD COLUMN clippability_score INTEGER`,
  },
  {
    name: '2026-06-16_clip_candidates_clippability_judged_at',
    sql: `ALTER TABLE clip_candidates ADD COLUMN clippability_judged_at TEXT`,
  },
  {
    name: '2026-06-16_clip_candidates_clippability_verdict',
    sql: `ALTER TABLE clip_candidates ADD COLUMN clippability_verdict TEXT`,
  },
  {
    name: '2026-06-16_clip_candidates_suggested_caption_hook',
    sql: `ALTER TABLE clip_candidates ADD COLUMN suggested_caption_hook TEXT`,
  },
  {
    name: '2026-06-16_idx_clip_candidates_clippability_score',
    sql: `CREATE INDEX IF NOT EXISTS idx_clip_candidates_clippability_score
            ON clip_candidates(operator_id, vlog_id, clippability_score DESC)
            WHERE deleted_at IS NULL AND status = 'pending'`,
  },
]

const BENIGN_PATTERNS = [
  /duplicate column name/i,
  /already exists/i,
  /no such table.*schema_migrations/i, // bootstrap-itself path
]

export interface MigrationResult {
  name: string
  status: 'applied' | 'skipped_already_recorded' | 'skipped_already_present' | 'failed'
  error?: string
}

/**
 * Apply every migration not yet recorded in `schema_migrations`.
 *
 * Bootstrap-safe: if `schema_migrations` itself doesn't exist, we create it
 * first, then run all migrations marking them applied as we go.
 *
 * Idempotent: safe to call from every request; the SELECT-then-skip path is
 * cheap. Callers should still memoize via `ensureMigrationsOnce` to avoid the
 * D1 round-trip on every request.
 */
export async function runMigrations(db: D1Database): Promise<MigrationResult[]> {
  // Bootstrap the bookkeeping table itself.
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  ).run()

  // Load the set of already-applied migration names. Single indexed read.
  const appliedRows = await db.prepare('SELECT name FROM schema_migrations').all<{ name: string }>()
  const applied = new Set((appliedRows.results ?? []).map(r => r.name))

  const results: MigrationResult[] = []

  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) {
      results.push({ name: m.name, status: 'skipped_already_recorded' })
      continue
    }
    try {
      await db.prepare(m.sql).run()
      await db.prepare(
        `INSERT INTO schema_migrations (name) VALUES (?) ON CONFLICT(name) DO NOTHING`,
      ).bind(m.name).run()
      results.push({ name: m.name, status: 'applied' })
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (BENIGN_PATTERNS.some(re => re.test(msg))) {
        // Column/table already exists from a pre-bookkeeping run. Mark it
        // applied so we never try again.
        await db.prepare(
          `INSERT INTO schema_migrations (name) VALUES (?) ON CONFLICT(name) DO NOTHING`,
        ).bind(m.name).run()
        results.push({ name: m.name, status: 'skipped_already_present', error: msg })
      } else {
        results.push({ name: m.name, status: 'failed', error: msg })
      }
    }
  }
  return results
}

/**
 * Per-isolate memoized wrapper. Call this from any /api/v2/* route at the top
 * of the handler. Cost: one indexed SELECT per Worker isolate (which lives
 * for minutes), not per request. After first call within an isolate, subsequent
 * calls are no-ops.
 *
 * Failures are not thrown — they're logged. We never want a migration glitch
 * to break the user-facing request; better to surface the issue via the
 * health endpoint than 500 every page.
 */
declare global {
  // eslint-disable-next-line no-var
  var __neologMigrationsRan: boolean | undefined
  // eslint-disable-next-line no-var
  var __neologMigrationsPromise: Promise<void> | undefined
}

export async function ensureMigrationsOnce(db: D1Database): Promise<void> {
  if (globalThis.__neologMigrationsRan) return
  // De-dupe concurrent first calls within the same isolate.
  if (globalThis.__neologMigrationsPromise) return globalThis.__neologMigrationsPromise
  globalThis.__neologMigrationsPromise = (async () => {
    try {
      const results = await runMigrations(db)
      const failed = results.filter(r => r.status === 'failed')
      if (failed.length > 0) {
        console.error('[migrations] some failed', failed)
      } else {
        const applied = results.filter(r => r.status === 'applied')
        if (applied.length > 0) {
          console.log(`[migrations] applied ${applied.length} new migration(s):`, applied.map(r => r.name))
        }
      }
    } catch (err: any) {
      console.error('[migrations] runner threw', err?.message || err)
    } finally {
      globalThis.__neologMigrationsRan = true
    }
  })()
  return globalThis.__neologMigrationsPromise
}
