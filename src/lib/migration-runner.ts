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
