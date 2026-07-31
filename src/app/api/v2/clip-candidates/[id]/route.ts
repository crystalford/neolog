/**
 * PATCH /api/v2/clip-candidates/[id]
 *
 * Edits a candidate's start_time / end_time — the save action for the
 * text-based clip editor (/clips/[id]/edit). Most extractor-flagged
 * candidates are one-liners; this is how the operator extends a clip to
 * include the surrounding lead-up/landing, or trims it tighter, by
 * picking new word boundaries instead of scrubbing video.
 *
 * Body: { start_time: number, end_time: number, quote?: string }
 *
 * Side effects of a boundary edit:
 *   - `quote` is recomputed from the transcript words in the NEW span
 *     (unless the caller supplies one explicitly) so captions and the
 *     /clips feed reflect what the clip actually contains now.
 *   - `clippability_score` / `clippability_judged_at` / `clippability_verdict`
 *     are cleared — the judge scored the OLD span; the new content needs
 *     its own verdict. The backlog sweep (already self-driving on /clips
 *     and the cron) picks it back up automatically.
 *   - status resets to 'pending' if it had been 'approved' (already
 *     shipped), so it doesn't silently vanish from the review feed while
 *     the ship cache is stale.
 *   - any cached R2 clip + production tied to this candidate is
 *     invalidated (R2 object deleted, production.output_r2_key cleared)
 *     so the next "Cut clip" / auto-publish re-slices at the new
 *     boundaries instead of serving the old cached MP4.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany, run } from '@/lib/d1'
import { deleteObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

const MIN_DURATION_SEC = 2
const MAX_DURATION_SEC = 300  // generous manual-edit ceiling; auto-publish has its own floor/cap

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as {
    start_time?: number; end_time?: number; quote?: string
  }
  const startTime = Number(body.start_time)
  const endTime = Number(body.end_time)
  if (!isFinite(startTime) || !isFinite(endTime) || endTime - startTime < MIN_DURATION_SEC) {
    return NextResponse.json({ error: `clip must be at least ${MIN_DURATION_SEC}s` }, { status: 400 })
  }
  if (endTime - startTime > MAX_DURATION_SEC) {
    return NextResponse.json({ error: `clip can't exceed ${MAX_DURATION_SEC}s` }, { status: 400 })
  }

  const clip = await findOne<{ id: string; vlog_id: string; status: string }>(
    db,
    `SELECT id, vlog_id, status FROM clip_candidates
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!clip) return NextResponse.json({ error: 'Clip not found' }, { status: 404 })

  // Recompute the verbatim quote from the new span unless one was supplied.
  let quote = (body.quote ?? '').trim()
  if (!quote) {
    try {
      const words = await findMany<{ word: string }>(
        db,
        `SELECT word FROM transcript_words
          WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
          ORDER BY word_index ASC LIMIT 400`,
        clip.vlog_id, startTime, endTime,
      )
      quote = words.map(w => w.word).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim().slice(0, 600)
    } catch {}
  }

  await run(
    db,
    `UPDATE clip_candidates
        SET start_time = ?, end_time = ?,
            quote = COALESCE(NULLIF(?, ''), quote),
            clippability_score = NULL,
            clippability_judged_at = NULL,
            clippability_verdict = NULL,
            status = CASE WHEN status = 'approved' THEN 'pending' ELSE status END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    startTime, endTime, quote, clip.id, operator.id,
  )

  // Invalidate any already-shipped clip so the next cut re-slices at the
  // new boundaries instead of serving the stale cached MP4.
  try {
    const existingProd = await findOne<{ id: string; output_r2_key: string | null }>(
      db,
      `SELECT id, output_r2_key FROM productions
        WHERE operator_id = ? AND source_kind = 'clip_candidate' AND source_id = ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      operator.id, clip.id,
    )
    if (existingProd?.output_r2_key) {
      await deleteObject(env, existingProd.output_r2_key).catch(() => {})
      await run(
        db,
        `UPDATE productions SET output_r2_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        existingProd.id,
      )
    }
  } catch (err: any) {
    console.warn(`[clip-candidates PATCH] cache invalidation failed: ${err?.message || err}`)
  }

  return NextResponse.json({
    ok: true, start_time: startTime, end_time: endTime, quote,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
