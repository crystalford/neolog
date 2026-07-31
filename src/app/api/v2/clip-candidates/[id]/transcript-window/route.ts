/**
 * GET /api/v2/clip-candidates/[id]/transcript-window
 *
 * Feeds the text-based clip editor (/clips/[id]/edit). Returns the clip's
 * source vlog, its current start/end, and every transcript word in a
 * generous window around it (default 90s padding each side) so the
 * operator can extend or trim the clip by clicking words instead of
 * scrubbing a video timeline — the same idea as Descript's text editor.
 *
 * Response:
 *   {
 *     clip_id, vlog_id, vlog_title, headline, quote,
 *     current_start_time, current_end_time,
 *     window_start_time, window_end_time,
 *     words: [{ word, start_time, end_time }]
 *   }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

const PAD_SEC = 90

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const clip = await findOne<{
    id: string; vlog_id: string; headline: string; quote: string | null
    start_time: number; end_time: number
    vlog_title: string | null
  }>(
    db,
    `SELECT cc.id, cc.vlog_id, cc.headline, cc.quote, cc.start_time, cc.end_time,
            v.title AS vlog_title
       FROM clip_candidates cc
       JOIN vlogs v ON v.id = cc.vlog_id
      WHERE cc.id = ? AND cc.operator_id = ? AND cc.deleted_at IS NULL
        AND v.deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  const windowStart = Math.max(0, clip.start_time - PAD_SEC)
  const windowEnd = clip.end_time + PAD_SEC

  const words = await findMany<{ word: string; start_time: number; end_time: number }>(
    db,
    `SELECT word, start_time, end_time FROM transcript_words
      WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
      ORDER BY word_index ASC
      LIMIT 3000`,
    clip.vlog_id, windowStart, windowEnd,
  )

  return NextResponse.json({
    clip_id: clip.id,
    vlog_id: clip.vlog_id,
    vlog_title: clip.vlog_title,
    headline: clip.headline,
    quote: clip.quote,
    current_start_time: clip.start_time,
    current_end_time: clip.end_time,
    window_start_time: windowStart,
    window_end_time: windowEnd,
    words,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
