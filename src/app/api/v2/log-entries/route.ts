/**
 * GET  /api/v2/log-entries?limit=200  — list, newest occurred_at first
 * POST /api/v2/log-entries            — create
 *
 * The whole capture door: type a sentence, optionally backdate it, it's on
 * the timeline. No categories, no required fields beyond the text itself —
 * see the migration comment for why that's deliberate, not an oversight.
 *
 * Body: { text: string, occurred_at?: string }
 *   occurred_at defaults to now; pass an ISO date/datetime to backlog
 *   something that already happened ("got a job last Thursday").
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const url = new URL(req.url)
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10)))

  const entries = await findMany<{ id: string; text: string; occurred_at: string; created_at: string }>(
    db,
    `SELECT id, text, occurred_at, created_at FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY occurred_at DESC LIMIT ?`,
    operator.id, limit,
  )
  return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'no-store' } })
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
  const body = await req.json().catch(() => ({})) as { text?: string; occurred_at?: string }
  const text = (body.text || '').trim()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.length > 4000) return NextResponse.json({ error: 'text too long (4000 char max)' }, { status: 400 })

  let occurredAt = new Date().toISOString()
  if (body.occurred_at) {
    const d = new Date(body.occurred_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'occurred_at is not a valid date' }, { status: 400 })
    occurredAt = d.toISOString()
  }

  const id = ulid()
  await run(
    db,
    `INSERT INTO log_entries (id, operator_id, text, occurred_at) VALUES (?, ?, ?, ?)`,
    id, operator.id, text, occurredAt,
  )
  return NextResponse.json({ id, text, occurred_at: occurredAt }, { headers: { 'Cache-Control': 'no-store' } })
}
