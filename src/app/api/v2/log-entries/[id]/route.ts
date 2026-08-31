/**
 * PATCH  /api/v2/log-entries/[id] — edit text and/or occurred_at
 * DELETE /api/v2/log-entries/[id] — soft delete
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const body = await req.json().catch(() => ({})) as { text?: string; occurred_at?: string }

  const existing = await findOne<{ id: string }>(
    db,
    `SELECT id FROM log_entries WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fields: string[] = []
  const values: any[] = []
  if (typeof body.text === 'string') {
    const text = body.text.trim()
    if (!text) return NextResponse.json({ error: 'text cannot be empty' }, { status: 400 })
    if (text.length > 4000) return NextResponse.json({ error: 'text too long (4000 char max)' }, { status: 400 })
    fields.push('text = ?'); values.push(text)
  }
  if (typeof body.occurred_at === 'string') {
    const d = new Date(body.occurred_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'occurred_at is not a valid date' }, { status: 400 })
    fields.push('occurred_at = ?'); values.push(d.toISOString())
  }
  if (fields.length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(params.id, operator.id)
  await run(db, `UPDATE log_entries SET ${fields.join(', ')} WHERE id = ? AND operator_id = ?`, ...values)

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  await run(
    db,
    `UPDATE log_entries SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    params.id, operator.id,
  )
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
