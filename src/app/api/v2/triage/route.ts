/**
 * GET  /api/v2/triage — what arrived on its own and hasn't been looked at.
 * POST /api/v2/triage — one decision on one entry.
 *
 * `triage.html`: "Fifty things arrived on their own. Go through them at ten
 * seconds each — or don't; they're already filed. Everything that arrives is
 * placed by date before you see it. This is optional: one thing at a time,
 * four keys, no wrong answers. **Skipping the whole pile costs nothing** —
 * it's still on the log, still searchable. Going through it adds your words."
 *
 * That is the whole design, and it means this endpoint must never behave
 * like an inbox: no unread state that blocks anything, no count that has to
 * be brought to zero, no penalty for never opening it. `triaged_at` records
 * only that he has looked.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const rows = await findMany<{
    id: string; text: string; detail: string | null
    happened_at: string; date_precision: string; visibility: string
    held_reason: string | null; r2_key: string | null; mime: string | null
    original_filename: string | null; source_kind: string
  }>(
    db,
    `SELECT id, text, detail,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            date_precision, visibility, held_reason, r2_key, mime,
            original_filename, source_kind
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND author = 'log' AND triaged_at IS NULL
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 60`,
    operator.id,
  )

  const left = await findMany<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND author = 'log' AND triaged_at IS NULL`,
    operator.id,
  )

  const items = await Promise.all(rows.map(async r => {
    let media_url: string | null = null
    if (r.r2_key) {
      try { media_url = await presignGetUrl(env, r.r2_key, 24 * 3600) } catch {}
    }
    return { ...r, media_url }
  }))

  return NextResponse.json(
    { items, total: left[0]?.n || 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as {
    id?: string
    // keep | bury | public | words
    action?: string
    text?: string
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Every action marks it looked-at. "No wrong answers" — the four are
  // equally valid outcomes, and none of them is the one he is meant to pick.
  const sets = ['triaged_at = CURRENT_TIMESTAMP', 'updated_at = CURRENT_TIMESTAMP']
  const binds: unknown[] = []

  if (body.action === 'bury') {
    sets.push('buried_at = CURRENT_TIMESTAMP', "visibility = 'private'")
  } else if (body.action === 'public') {
    sets.push("visibility = 'public'", 'held_reason = NULL')
  } else if (body.action === 'words' && typeof body.text === 'string' && body.text.trim()) {
    // "Going through it adds your words." His line replaces the log's, and
    // the author flips, because it is his now.
    sets.push('text = ?', "author = 'operator'")
    binds.push(body.text.trim())
  }

  binds.push(body.id, operator.id)
  await run(
    db,
    `UPDATE log_entries SET ${sets.join(', ')} WHERE id = ? AND operator_id = ?`,
    ...binds,
  )
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
