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
