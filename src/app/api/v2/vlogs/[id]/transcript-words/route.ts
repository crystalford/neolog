/**
 * GET /api/v2/vlogs/[id]/transcript-words
 *
 * Feeds the whole-vlog click-to-cut editor on /vlog/[id] (see
 * VlogTranscriptEditor). Full-vlog counterpart to
 * /api/v2/clip-candidates/[id]/transcript-window — that route windows
 * ±90s around one clip; this one has no clip to window around, so it
 * returns every word in the vlog plus whatever cut-range draft the
 * operator has saved so far.
 *
 * Response:
 *   {
 *     vlog_id, vlog_title, duration_seconds,
 *     words: [{ word, start_time, end_time }],
 *     cut_ranges: [{ start_word_index, end_word_index }],
 *     cut_ranges_updated_at: string | null
 *   }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

// A 20-minute vlog at ~150-180 wpm is roughly 3000-3600 words; this cap
// just guards against a pathological outlier, not normal vlog length.
const WORDS_LIMIT = 20000

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const vlog = await findOne<{
    id: string; title: string | null; duration_seconds: number | null
    cut_ranges_json: string | null; cut_ranges_updated_at: string | null
  }>(
    db,
    `SELECT id, title, duration_seconds, cut_ranges_json, cut_ranges_updated_at
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Vlog not found' }, { status: 404 })

  const words = await findMany<{ word: string; start_time: number; end_time: number }>(
    db,
    `SELECT word, start_time, end_time FROM transcript_words
      WHERE vlog_id = ?
      ORDER BY word_index ASC
      LIMIT ?`,
    params.id, WORDS_LIMIT,
  )

  let cutRanges: Array<{ start_word_index: number; end_word_index: number }> = []
  if (vlog.cut_ranges_json) {
    try {
      const parsed = JSON.parse(vlog.cut_ranges_json)
      if (Array.isArray(parsed)) cutRanges = parsed
    } catch {}
  }

  return NextResponse.json({
    vlog_id: vlog.id,
    vlog_title: vlog.title,
    duration_seconds: vlog.duration_seconds,
    words,
    cut_ranges: cutRanges,
    cut_ranges_updated_at: vlog.cut_ranges_updated_at,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
