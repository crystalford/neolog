/**
 * POST /api/v2/admin/cleanup-auto-extracted
 *
 * Soft-deletes thread rows produced by the now-removed auto-extract
 * fallback. That fallback (src/lib/extract-unified.ts — deleted in a
 * prior commit) manufactured a single thread from any transcript >=
 * 30 chars whenever the LLM returned empty. Result: junk rows like
 * "We got Phil's fat dented head for eight songs" polluting the
 * threads table and the timeline.
 *
 * Detection heuristics (a row is junk if ALL true):
 *   - validated = 1 (the fallback always set this)
 *   - register = 'observation' (fallback always used this)
 *   - strength = 3 (fallback always used this)
 *   - key_quotes contains exactly one entry that equals the take
 *     (the fallback set both to the same string)
 *
 * Soft-delete only (deleted_at = CURRENT_TIMESTAMP). The data sticks
 * around in case the operator wants to inspect later; the API filters
 * still hide them from the UI.
 *
 * Returns counts so the operator sees how many got cleaned. Idempotent.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)

  // Find candidates. The fallback pattern: take string equals the
  // sole key_quotes entry, with the canonical defaults.
  const rows = await db.prepare(
    `SELECT id, take, key_quotes
       FROM threads
      WHERE operator_id = ?
        AND deleted_at IS NULL
        AND register = 'observation'
        AND COALESCE(strength, 0) = 3
        AND COALESCE(validated, 0) = 1
        AND take IS NOT NULL`,
  ).bind(operator.id).all<{ id: string; take: string; key_quotes: string | null }>()

  const candidates = (rows.results ?? []).filter(r => {
    if (!r.key_quotes) return false
    try {
      const kq = JSON.parse(r.key_quotes)
      if (!Array.isArray(kq) || kq.length !== 1) return false
      const first = typeof kq[0] === 'string' ? kq[0] : (kq[0]?.text ?? '')
      return first === r.take
    } catch { return false }
  })

  let deleted = 0
  for (const c of candidates) {
    try {
      await db.prepare(
        `UPDATE threads SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).bind(c.id).run()
      deleted++
    } catch (e) {
      console.warn(`[cleanup-auto-extracted] failed for ${c.id}:`, (e as any)?.message)
    }
  }

  return NextResponse.json({
    ok: true,
    candidates_found: candidates.length,
    deleted,
    sample: candidates.slice(0, 5).map(c => ({ id: c.id, take: c.take.slice(0, 80) })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
