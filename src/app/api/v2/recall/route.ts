/**
 * GET  /api/v2/recall — the open questions, for the rail.
 * POST /api/v2/recall — answer one, or say you don't remember.
 *
 * Recall is a verb, not a place (SPEC §1). There is no questions page; a
 * question appears where the gap is and is answered there.
 *
 * The GET generates new questions in the background via `waitUntil` when
 * there is room for more, so the operator never waits on it and is never
 * interrupted by it.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { openQuestions, generateQuestions, answerQuestion, dismissQuestion } from '@/lib/recall'
import type { DatePrecision } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest) {
  const { env: rawEnv, ctx } = getRequestContext()
  const env = rawEnv as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const questions = await openQuestions(db, operator.id)

  // Top up after the reply, never before it. Looking for gaps is the log's
  // work, not something he waits on.
  if (questions.length < 3) {
    ctx.waitUntil(generateQuestions(db, operator.id).catch(() => {}))
  }

  return NextResponse.json({ questions }, { headers: { 'Cache-Control': 'no-store' } })
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
  const body = await req.json().catch(() => ({})) as {
    id?: string
    text?: string
    year?: number
    precision?: DatePrecision
    dont_remember?: boolean
    dismiss?: boolean
  }
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (body.dismiss) {
    const ok = await dismissQuestion(db, operator.id, body.id)
    return NextResponse.json({ ok }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const result = await answerQuestion(db, operator.id, body.id, {
    text: body.text,
    year: body.year,
    precision: body.precision,
    dont_remember: body.dont_remember,
  })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
