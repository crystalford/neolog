/**
 * GET    /api/v2/topics/[id]                — single topic + any production attached
 * PATCH  /api/v2/topics/[id]                — update title / framing / angle / notes
 * DELETE /api/v2/topics/[id]                — soft delete
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const { id } = await ctx.params
  const topic = await findOne<{
    id: string; title: string; framing: string | null; angle: string | null
    notes: string | null; state: string; created_at: string; updated_at: string
  }>(
    getDb(env),
    `SELECT id, title, framing, angle, notes, state, created_at, updated_at
       FROM topics
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operator.id,
  )
  if (!topic) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const production = await findOne<{ id: string; state: string }>(
    getDb(env),
    `SELECT id, state FROM productions
      WHERE source_kind = 'topic' AND source_id = ?
        AND operator_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    id, operator.id,
  )
  return NextResponse.json({ topic, production }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const { id } = await ctx.params
  const patch = await req.json().catch(() => ({})) as {
    title?: string; framing?: string; angle?: string; notes?: string; state?: string
  }
  const fields: string[] = []
  const vals: unknown[] = []
  if (typeof patch.title === 'string') { fields.push('title = ?'); vals.push(patch.title.slice(0, 200)) }
  if (typeof patch.framing === 'string') { fields.push('framing = ?'); vals.push(patch.framing.slice(0, 800)) }
  if (typeof patch.angle === 'string') { fields.push('angle = ?'); vals.push(patch.angle.slice(0, 800)) }
  if (typeof patch.notes === 'string') { fields.push('notes = ?'); vals.push(patch.notes.slice(0, 4000)) }
  if (typeof patch.state === 'string') { fields.push('state = ?'); vals.push(patch.state.slice(0, 32)) }
  if (fields.length === 0) return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  fields.push('updated_at = CURRENT_TIMESTAMP')
  vals.push(id, operator.id)
  await run(
    getDb(env),
    `UPDATE topics SET ${fields.join(', ')} WHERE id = ? AND operator_id = ?`,
    ...vals,
  )
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const { id } = await ctx.params
  await run(
    getDb(env),
    `UPDATE topics SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    id, operator.id,
  )
  return NextResponse.json({ ok: true })
}
