/**
 * GET  /api/v2/clear — every stored file's state, and the total that is safe
 *                      to delete from the phone.
 * POST /api/v2/clear — re-run the check on anything not yet verified.
 *
 * "'Clear it' means verified, not uploaded. Uploaded isn't kept." The
 * reasoning and the two kinds of check are in `src/lib/keep.ts`.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { clearSummary, verifyStored } from '@/lib/keep'
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
  return NextResponse.json(
    await clearSummary(getDb(env), operator.id),
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

  // Anything the log has not been able to say yes or no about yet. A file it
  // already called `checked` is not re-checked; a `mismatch` is, because a
  // re-send may have fixed it.
  const pending = await findMany<{
    id: string; r2_key: string; checksum: string | null; bytes: number | null
  }>(
    db,
    `SELECT id, r2_key, checksum, bytes FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND r2_key IS NOT NULL
        AND (keep_state IS NULL OR keep_state IN ('checking', 'pending', 'mismatch'))
      ORDER BY COALESCE(happened_at, occurred_at) DESC
      LIMIT 25`,
    operator.id,
  )

  let checked = 0
  for (const f of pending) {
    const verdict = await verifyStored(env, f.r2_key, { checksum: f.checksum, bytes: f.bytes })
    await run(
      db,
      `UPDATE log_entries
          SET keep_state = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      verdict.state, verdict.verified_by, f.id,
    )
    if (verdict.state === 'checked') checked++
  }

  return NextResponse.json(
    { looked_at: pending.length, now_checked: checked, remaining: pending.length === 25 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
