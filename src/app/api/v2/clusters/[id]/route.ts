export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const c = await findOne<{
    id: string; topic: string; abstracted_topic: string | null; take: string | null
    state: string; ripeness_score: number | null; form: string | null; gap_question: string | null
    topic_color: string | null
  }>(db, `SELECT id, topic, abstracted_topic, take, state, ripeness_score, form, gap_question, topic_color
            FROM clusters WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
       params.id, operator.id)
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const threads = await findMany<{ id: string; topic: string; take: string | null; strength: number | null }>(
    db,
    `SELECT t.id, t.topic, t.take, t.strength
       FROM threads t
       JOIN cluster_threads ct ON ct.thread_id = t.id
      WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
      ORDER BY t.strength DESC, t.extracted_at ASC`,
    params.id, operator.id,
  )

  const insights = await findMany<{ subtype: string; body: string }>(
    db,
    `SELECT subtype, body FROM cluster_insights
      WHERE cluster_id = ? AND operator_id = ?
      ORDER BY created_at DESC LIMIT 10`,
    params.id, operator.id,
  )

  return NextResponse.json({
    cluster: {
      id: c.id,
      topic: c.topic,
      abstracted_topic: c.abstracted_topic,
      take: c.take,
      state: c.state,
      ripeness_score: c.ripeness_score ?? 0,
      form: c.form,
      gap_question: c.gap_question,
      topic_color: c.topic_color,
      threads: threads.map(t => ({ id: t.id, topic: t.topic, take: t.take || '', strength: t.strength })),
      insights: insights.map(i => ({ kind: kindLabel(i.subtype), body: i.body })),
    },
  })
}

function kindLabel(k: string): string {
  return ({ name: 'Name', parallel: 'Parallel', evidence: 'Evidence', framework: 'Framework', auto_link: 'Auto-link' } as Record<string, string>)[k] || k
}
