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

  // cluster_insights schema (db/schema.sql:313) uses `kind` + `title`
  // + `body` columns and has no operator_id (cluster_id FK to clusters
  // already scopes to the operator). Previously queried non-existent
  // columns — fixed when the cultivate pass started populating this
  // table.
  const insights = await findMany<{ kind: string; title: string | null; body: string; bounce_run_id: string | null; created_at: string }>(
    db,
    `SELECT kind, title, body, bounce_run_id, created_at
       FROM cluster_insights
      WHERE cluster_id = ?
      ORDER BY created_at DESC
      LIMIT 30`,
    params.id,
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
      insights: insights.map(i => ({
        kind: i.kind,
        kind_label: kindLabel(i.kind),
        title: i.title,
        body: i.body,
        bounce_run_id: i.bounce_run_id,
        created_at: i.created_at,
      })),
    },
  })
}

function kindLabel(k: string): string {
  return ({
    name: 'Named concept',
    parallel: 'Adjacent',
    evidence: 'Evidence',
    framework: 'Framework',
    counter_position: 'Counter',
    gap_question: 'Open question',
  } as Record<string, string>)[k] || k
}
