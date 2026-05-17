/**
 * POST /api/v2/admin/run-migrations
 *
 * Idempotently apply every D1 migration we know about. Each statement is
 * executed independently so an "already-applied" failure on one ALTER
 * doesn't block the rest. Used to recover when the bootstrap workflow
 * applied migrations.sql in a single batch and bailed on the first
 * duplicate-column error, leaving later CREATE TABLE statements
 * unexecuted.
 *
 * Returns a per-statement result so the operator can see exactly which
 * migrations applied, which were skipped (already present), and which
 * actually failed for a real reason.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

// Each entry mirrors a statement in db/migrations.sql. Kept inline so the
// endpoint is self-contained and doesn't need a file read at runtime.
const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: 'vlogs.thumbnail_r2_key',
    sql: `ALTER TABLE vlogs ADD COLUMN thumbnail_r2_key TEXT`,
  },
  {
    name: 'idx_vlogs_thumbnail_r2_key',
    sql: `CREATE INDEX IF NOT EXISTS idx_vlogs_thumbnail_r2_key ON vlogs(thumbnail_r2_key)`,
  },
  {
    name: 'vlogs.extraction_outcomes',
    sql: `ALTER TABLE vlogs ADD COLUMN extraction_outcomes TEXT`,
  },
  {
    name: 'chat_threads',
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
    name: 'idx_chat_threads_operator',
    sql: `CREATE INDEX IF NOT EXISTS idx_chat_threads_operator ON chat_threads(operator_id, updated_at DESC)`,
  },
  {
    name: 'chat_messages',
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
    name: 'idx_chat_messages_thread',
    sql: `CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON chat_messages(thread_id, created_at)`,
  },
  {
    name: 'chat_attachments',
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
    name: 'idx_chat_attachments_thread',
    sql: `CREATE INDEX IF NOT EXISTS idx_chat_attachments_thread ON chat_attachments(thread_id, created_at)`,
  },
  {
    name: 'operator_settings',
    sql: `CREATE TABLE IF NOT EXISTS operator_settings (
      operator_id TEXT NOT NULL,
      key         TEXT NOT NULL,
      value       TEXT,
      updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (operator_id, key)
    )`,
  },
]

// "Already applied" SQLite errors we want to swallow as success-equivalent.
const BENIGN_PATTERNS = [
  /duplicate column name/i,
  /already exists/i,
]

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  try {
    await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const db = getDb(env)
  const results: { name: string; status: 'applied' | 'skipped' | 'failed'; error?: string }[] = []

  for (const m of MIGRATIONS) {
    try {
      await db.prepare(m.sql).run()
      results.push({ name: m.name, status: 'applied' })
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (BENIGN_PATTERNS.some(re => re.test(msg))) {
        results.push({ name: m.name, status: 'skipped', error: msg })
      } else {
        results.push({ name: m.name, status: 'failed', error: msg })
      }
    }
  }

  const applied = results.filter(r => r.status === 'applied').length
  const skipped = results.filter(r => r.status === 'skipped').length
  const failed = results.filter(r => r.status === 'failed').length

  return NextResponse.json({
    ok: failed === 0,
    summary: { applied, skipped, failed, total: MIGRATIONS.length },
    results,
  })
}
