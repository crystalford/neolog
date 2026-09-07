/**
 * GET    /api/v2/log/relog          — how much of the corpus is on the log
 * POST   /api/v2/log/relog          — relog one page  { cursor?, limit? }
 * DELETE /api/v2/log/relog          — undo the whole relog
 *
 * Puts the recordings that already exist onto the log: every take the
 * extraction passes found becomes a dated entry, placed at the second it was
 * said. The reasoning is in `src/lib/relog.ts`.
 *
 * Paged, because 320 vlogs will not fit in one Function invocation. The
 * caller keeps posting `next_cursor` back until it returns null. Idempotent
 * at the row level, so a retry after a timeout is always safe.
 *
 * DELETE removes exactly what relog wrote — every row it created carries
 * `source_ref = 'thread:<id>'` — and never touches anything typed by hand.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { relogBatch, relogStatus, unrelogAll } from '@/lib/relog'
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
  const status = await relogStatus(await readyDb(getDb(env), 'relog'), operator!.id)
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const body = await req.json().catch(() => ({})) as { cursor?: string; limit?: number }
  const result = await relogBatch(await readyDb(getDb(env), 'relog'), operator!.id, {
    cursor: body.cursor || null,
    limit: body.limit,
  })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const removed = await unrelogAll(await readyDb(getDb(env), 'relog'), operator!.id)
  return NextResponse.json({ removed }, { headers: { 'Cache-Control': 'no-store' } })
}
