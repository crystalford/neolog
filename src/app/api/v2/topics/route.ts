/**
 * Topics — the create-from-scratch surface.
 *
 *   GET  → list the operator's topics (most-recent first)
 *   POST → create a new topic. body: { title, angle?, notes? }
 *
 * A topic is an arbitrary subject the operator types: a person, a
 * fascination, an idea they want to make a video essay about. Distinct
 * from Subjects (auto-surfaced from past vlogs). Same Studio downstream:
 * a topic generates a video_essay production via the existing
 * /productions endpoint with source_kind='topic'.
 *
 * Topics intentionally do NOT auto-research the web. The operator is the
 * editor; what they type into `angle` and `notes` is the brief. The
 * generator anchors voice in their past vlogs; the topic provides the
 * subject matter.
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
  const topics = await findMany<{
    id: string; title: string; framing: string | null
    angle: string | null; state: string; updated_at: string
    production_id: string | null
  }>(
    getDb(env),
    `SELECT
        t.id, t.title, t.framing, t.angle, t.state, t.updated_at,
        (SELECT p.id FROM productions p
          WHERE p.source_kind = 'topic' AND p.source_id = t.id
            AND p.production_type = 'video_essay' AND p.operator_id = t.operator_id
            AND p.deleted_at IS NULL
          ORDER BY p.created_at DESC LIMIT 1) AS production_id
       FROM topics t
      WHERE t.operator_id = ? AND t.deleted_at IS NULL
      ORDER BY t.updated_at DESC`,
    operator.id,
  )
  return NextResponse.json({ topics }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const body = await req.json().catch(() => ({})) as {
    title?: string; angle?: string; notes?: string; framing?: string
  }
  const title = (body.title ?? '').trim()
  if (title.length < 2) {
    return NextResponse.json({ error: 'title required (min 2 chars)' }, { status: 400 })
  }
  const id = ulid()
  await run(
    getDb(env),
    `INSERT INTO topics (id, operator_id, title, framing, angle, notes, state)
     VALUES (?, ?, ?, ?, ?, ?, 'forming')`,
    id, operator.id, title.slice(0, 200),
    (body.framing ?? '').slice(0, 800),
    (body.angle ?? '').slice(0, 800),
    (body.notes ?? '').slice(0, 4000),
  )
  return NextResponse.json({ ok: true, id }, { headers: { 'Cache-Control': 'no-store' } })
}
