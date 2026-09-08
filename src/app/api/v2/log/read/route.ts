/**
 * GET  /api/v2/log/read — how much of the corpus the log has read.
 * POST /api/v2/log/read — read a page of recordings onto the log.
 *
 * The replacement for relog. Relog turned the extraction model's `threads`
 * into entries; this reads the transcript directly, cutting at his own
 * pauses. No model is involved at any point — see `src/lib/read-recording.ts`
 * for why that is the whole design rather than an optimisation.
 *
 * Paged, because four hundred recordings will not fit in one Function
 * invocation, and idempotent at the row level, so a retry after a timeout is
 * always safe.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { readRecording, readStatus } from '@/lib/read-recording'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

async function operatorOr401(req: NextRequest, env: Env) {
  try { return { operator: await requireOperator(req, env), error: null as null } }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return { operator: null, error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
    }
    throw e
  }
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const status = await readStatus(await readyDb(getDb(env), 'read'), operator!.id)
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'read')
  const body = await req.json().catch(() => ({})) as { cursor?: string; limit?: number; vlog_id?: string }

  // One recording, named — the button on its own page.
  if (body.vlog_id) {
    const r = await readRecording(db, operator!.id, body.vlog_id)
    return NextResponse.json({ ...r, next_cursor: null }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Or a page of them, oldest first so a partial run fills the log from the
  // beginning rather than leaving a hole in the middle.
  const limit = Math.min(20, Math.max(1, body.limit ?? 5))
  const rows = await findMany<{ id: string }>(
    db,
    `SELECT id FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        ${body.cursor ? 'AND id > ?' : ''}
      ORDER BY id ASC LIMIT ?`,
    ...(body.cursor ? [operator!.id, body.cursor, limit] : [operator!.id, limit]),
  )

  let entries = 0, passages = 0, untranscribed = 0
  for (const r of rows) {
    const res = await readRecording(db, operator!.id, r.id)
    entries += res.entries_written
    passages += res.passages
    if (res.no_words) untranscribed++
  }

  return NextResponse.json(
    {
      recordings_seen: rows.length,
      passages,
      entries_written: entries,
      // Named out loud: a recording with no word timings is skipped, not
      // dated by guess.
      untranscribed,
      next_cursor: rows.length === limit ? rows[rows.length - 1].id : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
