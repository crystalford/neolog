/**
 * Single photo operations.
 *
 *   PATCH  → update caption. body { caption }
 *   DELETE → soft-delete (deleted_at). R2 objects left in place (cheap,
 *            and keeps undo trivial if we ever add it).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

async function auth(req: NextRequest, env: Env) {
  return requireOperator(req, env)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await auth(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as { caption?: string }
  const exists = await findOne<{ id: string }>(
    db, `SELECT id FROM photos WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`, params.id, operator.id,
  )
  if (!exists) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
  await run(
    db,
    `UPDATE photos SET caption = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND operator_id = ?`,
    (body.caption ?? '').slice(0, 2000) || null, params.id, operator.id,
  )
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await auth(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  await run(
    db,
    `UPDATE photos SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND operator_id = ?`,
    params.id, operator.id,
  )
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
