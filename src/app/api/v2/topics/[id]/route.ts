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
    research_brief: string | null; research_status: string | null
    research_at: string | null; pasted_urls_json: string | null
    suggestions_json: string | null; suggestions_grounded: number | null
  }>(
    getDb(env),
    `SELECT id, title, framing, angle, notes, state, created_at, updated_at,
            research_brief, research_status, research_at, pasted_urls_json,
            suggestions_json, suggestions_grounded
       FROM topics
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operator.id,
  )
  if (!topic) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let pasted_urls: string[] = []
  try { pasted_urls = topic.pasted_urls_json ? JSON.parse(topic.pasted_urls_json) : [] } catch {}
  let suggestions: any[] = []
  try { suggestions = topic.suggestions_json ? JSON.parse(topic.suggestions_json) : [] } catch {}
  // Also surface the per-source rows so the operator can audit what was used.
  const sources = await (await import('@/lib/d1')).findMany<{
    id: string; url: string; title: string | null; origin: string | null
    bytes: number | null; fetched_at: string; error: string | null
  }>(
    getDb(env),
    `SELECT id, url, title, origin, bytes, fetched_at, error
       FROM topic_sources
      WHERE topic_id = ?
      ORDER BY fetched_at DESC`,
    id,
  )
  const production = await findOne<{ id: string; state: string }>(
    getDb(env),
    `SELECT id, state FROM productions
      WHERE source_kind = 'topic' AND source_id = ?
        AND operator_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    id, operator.id,
  )
  return NextResponse.json({
    topic: { ...topic, pasted_urls },
    production,
    sources,
    suggestions,
    suggestions_grounded: topic.suggestions_grounded === 1,
  }, { headers: { 'Cache-Control': 'no-store' } })
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
    pasted_urls?: string[]; research_brief?: string
  }
  const fields: string[] = []
  const vals: unknown[] = []
  if (typeof patch.title === 'string') { fields.push('title = ?'); vals.push(patch.title.slice(0, 200)) }
  if (typeof patch.framing === 'string') { fields.push('framing = ?'); vals.push(patch.framing.slice(0, 800)) }
  if (typeof patch.angle === 'string') { fields.push('angle = ?'); vals.push(patch.angle.slice(0, 800)) }
  if (typeof patch.notes === 'string') { fields.push('notes = ?'); vals.push(patch.notes.slice(0, 4000)) }
  if (typeof patch.state === 'string') { fields.push('state = ?'); vals.push(patch.state.slice(0, 32)) }
  if (Array.isArray(patch.pasted_urls)) {
    const cleaned = patch.pasted_urls.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 8)
    fields.push('pasted_urls_json = ?'); vals.push(JSON.stringify(cleaned))
  }
  if (typeof patch.research_brief === 'string') {
    fields.push('research_brief = ?'); vals.push(patch.research_brief)
  }
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
