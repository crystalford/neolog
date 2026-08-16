/**
 * PATCH /api/v2/vlogs/[id]/cut-ranges
 *
 * Saves the operator's draft edit for the whole-vlog click-to-cut editor
 * (VlogTranscriptEditor on /vlog/[id]). One draft per vlog — the whole
 * array is replaced on every save, there's no per-range endpoint.
 *
 * Body: { cut_ranges: { start_word_index: number, end_word_index: number }[] }
 *
 * Side effects of a save:
 *   - Any cached R2 render + production tied to this vlog's coherent edit
 *     is invalidated (R2 object deleted, production.output_r2_key
 *     cleared) — same pattern as clip-candidates PATCH — so the next
 *     "Render edit" re-cuts at the new ranges instead of serving a stale
 *     MP4 from before the edit changed.
 *
 * (Phase 2 hook: a future POST /api/v2/vlogs/[id]/suggest-cuts would
 * populate this exact same cut_ranges_json column via an LLM pass —
 * no schema change needed for that to slot in later.)
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { deleteObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

interface CutRange { start_word_index: number; end_word_index: number }

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const body = await req.json().catch(() => ({})) as { cut_ranges?: unknown }
  if (!Array.isArray(body.cut_ranges)) {
    return NextResponse.json({ error: 'cut_ranges array required' }, { status: 400 })
  }

  const ranges: CutRange[] = []
  for (const r of body.cut_ranges) {
    const start = Number((r as any)?.start_word_index)
    const end = Number((r as any)?.end_word_index)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      return NextResponse.json({ error: `invalid cut range: ${JSON.stringify(r)}` }, { status: 400 })
    }
    ranges.push({ start_word_index: start, end_word_index: end })
  }
  ranges.sort((a, b) => a.start_word_index - b.start_word_index)
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start_word_index <= ranges[i - 1].end_word_index) {
      return NextResponse.json({ error: 'cut ranges must not overlap' }, { status: 400 })
    }
  }

  const vlog = await findOne<{ id: string }>(
    db,
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Vlog not found' }, { status: 404 })

  await run(
    db,
    `UPDATE vlogs SET cut_ranges_json = ?, cut_ranges_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    JSON.stringify(ranges), vlog.id, operator.id,
  )

  // Invalidate any already-rendered coherent edit so the next render
  // re-cuts at the new ranges instead of serving the stale cached MP4.
  try {
    const existingProd = await findOne<{ id: string; output_r2_key: string | null }>(
      db,
      `SELECT id, output_r2_key FROM productions
        WHERE operator_id = ? AND source_kind = 'vlog' AND source_id = ?
          AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      operator.id, vlog.id,
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
    console.warn(`[vlogs cut-ranges PATCH] cache invalidation failed: ${err?.message || err}`)
  }

  return NextResponse.json({ ok: true, cut_ranges: ranges }, { headers: { 'Cache-Control': 'no-store' } })
}
