/**
 * GET /api/v2/away — what arrived while nothing was written.
 *
 * `away.html` is mostly a list of things the log refuses to do. Its own
 * heading is "While you were gone — nothing needed you", and the summary
 * line is "151 entries · all filed · nothing waiting".
 *
 * So: no welcome back, no broken streak, no badge, no unread count, no queue
 * to clear. The design's line for the gap itself is the whole attitude —
 * "You didn't write anything for nine days. 148 photos and one voice note
 * arrived on their own, so the days aren't empty — they just have no words
 * on them."
 *
 * That is a statement about the log, not a reproach, and this endpoint
 * returns exactly the facts needed to say it and nothing that could be
 * turned into a nag: no streak, no target, no "you usually write N a week".
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** Below this a gap is just a couple of quiet days, and not worth a word. */
const MIN_GAP_DAYS = 4

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'away')

  // The last thing he actually wrote — not the last thing that arrived.
  const lastWritten = await findMany<{ at: string }>(
    db,
    `SELECT COALESCE(logged_at, created_at) AS at FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND author = 'operator'
      ORDER BY COALESCE(logged_at, created_at) DESC LIMIT 1`,
    operator.id,
  )
  if (!lastWritten.length) {
    return NextResponse.json({ away: false }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const since = lastWritten[0].at
  const days = Math.floor((Date.now() - new Date(since).getTime()) / 86400000)
  if (!isFinite(days) || days < MIN_GAP_DAYS) {
    return NextResponse.json({ away: false }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // What arrived on its own in the meantime, by kind. Counts describe; they
  // are never a queue and never a number to bring down.
  const [entries, vlogs, photos] = await Promise.all([
    findMany<{ n: number; source_kind: string }>(
      db,
      `SELECT COUNT(*) AS n, source_kind FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
          AND author = 'log' AND COALESCE(logged_at, created_at) > ?
        GROUP BY source_kind`,
      operator.id, since,
    ),
    findMany<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL AND created_at > ?`,
      operator.id, since,
    ),
    findMany<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM photos
        WHERE operator_id = ? AND deleted_at IS NULL AND created_at > ?`,
      operator.id, since,
    ),
  ])

  const parts: { label: string; n: number }[] = []
  const photoN = photos[0]?.n || 0
  const vlogN = vlogs[0]?.n || 0
  if (photoN) parts.push({ label: photoN === 1 ? 'photo' : 'photos', n: photoN })
  if (vlogN) parts.push({ label: vlogN === 1 ? 'recording' : 'recordings', n: vlogN })
  for (const e of entries) {
    if (!e.n) continue
    const label = e.source_kind === 'voice'
      ? (e.n === 1 ? 'voice note' : 'voice notes')
      : (e.n === 1 ? 'file' : 'files')
    parts.push({ label, n: e.n })
  }

  const total = parts.reduce((n, p) => n + p.n, 0)

  return NextResponse.json(
    { away: true, days, since, total, parts },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
