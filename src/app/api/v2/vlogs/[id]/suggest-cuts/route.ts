/**
 * POST /api/v2/vlogs/[id]/suggest-cuts
 *
 * Phase 2 of the whole-vlog click-to-cut editor. Runs one LLM pass
 * (src/lib/suggest-cuts.ts) over the vlog's transcript to propose spans
 * to cut — tangents, repeats, dead filler — grounded back to real
 * word-index ranges via exact verbatim matching against
 * transcript_words. Ungrounded suggestions (the model paraphrased
 * instead of quoting) are silently dropped, never surfaced.
 *
 * Does NOT persist anything — this only returns suggestions. The
 * operator reviews them client-side (they render as ordinary
 * click-to-restore cut spans, same as a manual cut) and only they
 * hitting Save draft / Render edit writes anything to the vlog row.
 *
 * Response: { cuts: [{start_word_index,end_word_index,reason}], proposed, matched, model, fell_back }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { suggestCuts } from '@/lib/suggest-cuts'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: { run: (model: any, args: unknown) => Promise<any> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const vlog = await findOne<{ id: string; transcript_text: string | null }>(
    db,
    `SELECT id, transcript_text FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Vlog not found' }, { status: 404 })
  if (!vlog.transcript_text || !vlog.transcript_text.trim()) {
    return NextResponse.json({ error: 'No transcript available for this vlog' }, { status: 400 })
  }

  const words = await findMany<{ word: string; start_time: number; end_time: number }>(
    db,
    `SELECT word, start_time, end_time FROM transcript_words WHERE vlog_id = ? ORDER BY word_index ASC`,
    vlog.id,
  )
  if (words.length === 0) {
    return NextResponse.json({ error: 'No word-level transcript available to ground suggestions in' }, { status: 400 })
  }

  try {
    const result = await suggestCuts(env, { transcriptText: vlog.transcript_text, words })
    return NextResponse.json({
      cuts: result.cuts,
      proposed: result.proposed,
      matched: result.matched,
      model: result.model,
      fell_back: result.fellBack,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ error: `Suggestion pass failed: ${err?.message || String(err)}` }, { status: 502 })
  }
}
