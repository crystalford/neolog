/**
 * POST /api/v2/shorts/spark
 *
 * The "bang out a short" endpoint. Takes a concept the operator just
 * thought of, creates a minimal topic for it, and immediately generates
 * a short script. Returns the production id so the client can navigate
 * straight to it.
 *
 * Body: { concept: string, angle?: string }
 *
 * Same machinery as a regular topic-based production_type='short', just
 * a single round-trip from "I had a thought" to "here's the script." No
 * detail page, no fields, no decisions.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: any
  ANTHROPIC_API_KEY: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
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
    concept?: string
    angle?: string
  }
  const concept = (body.concept ?? '').trim()
  if (concept.length < 3) {
    return NextResponse.json({ error: 'concept required (min 3 chars)' }, { status: 400 })
  }
  const angle = (body.angle ?? '').trim()

  const db = getDb(env)
  // Create a lightweight topic to hang the short off. State='spark' so
  // the Topics list can hide / dim spark-only entries (they're throwaway
  // unless the operator promotes them).
  const topicId = ulid()
  await run(
    db,
    `INSERT INTO topics (id, operator_id, title, angle, notes, state)
     VALUES (?, ?, ?, ?, ?, 'spark')`,
    topicId, operator.id, concept.slice(0, 200), angle.slice(0, 800), '',
  )

  // Internal POST to /productions with production_type='short' from the
  // topic we just created. Forwards cookies so requireOperator() passes.
  const origin = new URL(req.url).origin
  const cookie = req.headers.get('cookie') || ''
  const r = await fetch(`${origin}/api/v2/productions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      source_kind: 'topic',
      source_id: topicId,
      production_type: 'short',
    }),
  })
  const d: any = await r.json().catch(() => ({}))
  if (!r.ok) {
    return NextResponse.json({
      error: d?.error || `script generation failed (HTTP ${r.status})`,
      topic_id: topicId,
    }, { status: 502 })
  }
  return NextResponse.json({
    ok: true,
    topic_id: topicId,
    production_id: d?.id,
    script: d?.production?.script_text ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
