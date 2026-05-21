/**
 * POST /api/v2/clusters/[id]/bounce
 *
 * The Bounce workflow — conversational refinement of a cluster.
 * Operator asks a follow-up question; the model has the cluster's
 * threads + prior insights as context and responds in the operator's
 * voice with a concrete answer.
 *
 * Each Q&A pair persists as TWO cluster_insights rows tagged with the
 * same bounce_run_id:
 *   - kind='gap_question' / title='operator' / body=<question>
 *   - kind='evidence' / title=<model id> / body=<answer>
 *
 * The cluster detail page renders these in chronological order as a
 * threaded conversation. Subsequent calls in the same session add
 * more rows under the same bounce_run_id so a multi-turn dialog is
 * one logical run.
 *
 * Body:
 *   {
 *     question: string,
 *     bounce_run_id?: string,     // omit on first turn — server creates one
 *     model?: 'llama70b' | 'kimi' | 'sonnet'  // default: workers AI llama70b
 *   }
 *
 * Returns:
 *   {
 *     ok: true,
 *     bounce_run_id,
 *     answer: string,
 *     tokens: { in, out }
 *   }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { callClaude } from '@/lib/anthropic'
import { ulid } from '@/lib/ulid'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: Ai
  ANTHROPIC_API_KEY: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

type ModelKey = 'llama70b' | 'kimi' | 'sonnet'
const MODEL_IDS: Record<ModelKey, { provider: 'workers_ai' | 'claude'; id: string }> = {
  llama70b: { provider: 'workers_ai', id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  kimi:     { provider: 'workers_ai', id: '@cf/moonshotai/kimi-k2.6' },
  sonnet:   { provider: 'claude',     id: 'claude-sonnet-4-6' },
}

const BOUNCE_PROMPT_VERSION = 'bounce-v1'

const SYSTEM_PROMPT = `You are the operator's thinking partner. They've built a personal life graph: vlogs → threads (atomic takes) → clusters (riffs that braid across vlogs over weeks). They're working a SPECIFIC cluster right now and have a follow-up question. You have the cluster's threads + prior insights as context.

Your job: give one CONCRETE answer to the operator's question. Address them in second person. No hedging. If you bring in an external thinker / framing, name them specifically. If you can't answer because you don't know, say so — don't invent.

Length: 2-5 sentences. Concrete > comprehensive.

Voice: direct, declarative, the way the operator already talks. Don't generalize. Don't restate the question. Just answer.`

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  let body: { question?: string; bounce_run_id?: string; model?: ModelKey } = {}
  try { body = await req.json() } catch {}
  const question = (body.question ?? '').trim()
  if (!question || question.length < 4) return NextResponse.json({ error: 'question required' }, { status: 400 })

  const db = getDb(env)

  // Verify cluster ownership.
  const cluster = await findOne<{ id: string; topic: string; abstracted_topic: string | null; take: string | null }>(
    db,
    `SELECT id, topic, abstracted_topic, take FROM clusters
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!cluster) return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })

  // Resolve model.
  const model: ModelKey = (body.model && body.model in MODEL_IDS) ? body.model : 'llama70b'
  const route = MODEL_IDS[model]

  // Load cluster threads (capped) + prior insights for context.
  const [threads, priorInsights] = await Promise.all([
    findMany<{ topic: string; take: string | null; key_quotes: string | null }>(
      db,
      `SELECT t.topic, t.take, t.key_quotes
         FROM threads t
         JOIN cluster_threads ct ON ct.thread_id = t.id
        WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
        ORDER BY COALESCE(t.strength, 3) DESC, t.extracted_at ASC
        LIMIT 12`,
      params.id, operator.id,
    ).catch(() => []),
    findMany<{ kind: string; title: string | null; body: string }>(
      db,
      `SELECT kind, title, body FROM cluster_insights
        WHERE cluster_id = ? ORDER BY created_at ASC LIMIT 30`,
      params.id,
    ).catch(() => []),
  ])

  const userPayload = {
    cluster: {
      topic: cluster.topic,
      abstracted_topic: cluster.abstracted_topic,
      take: cluster.take,
    },
    threads: threads.map(t => ({
      topic: t.topic,
      take: t.take,
      quote: t.key_quotes ? safeFirstQuote(t.key_quotes) : null,
    })),
    prior_insights: priorInsights.map(i => ({ kind: i.kind, title: i.title, body: i.body })),
    question,
  }

  // Reuse bounce_run_id if provided + valid, else create one.
  let bounce_run_id = body.bounce_run_id
  if (bounce_run_id) {
    const existing = await findOne<{ id: string }>(db,
      `SELECT id FROM bounce_runs WHERE id = ? AND cluster_id = ?`,
      bounce_run_id, params.id,
    )
    if (!existing) bounce_run_id = undefined
  }
  if (!bounce_run_id) {
    bounce_run_id = ulid()
    await run(
      db,
      `INSERT INTO bounce_runs
         (id, cluster_id, mode, prompt_version, started_at, provider)
       VALUES (?, ?, 'default', ?, CURRENT_TIMESTAMP, ?)`,
      bounce_run_id, params.id, BOUNCE_PROMPT_VERSION, `${route.provider}:${route.id}`,
    )
  }

  // ── Call the LLM ────────────────────────────────────────────────
  let answer = ''
  let inputTokens = 0
  let outputTokens = 0
  try {
    if (route.provider === 'claude') {
      const r = await callClaude(env, {
        model: route.id,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(userPayload, null, 2) }],
        maxTokens: 800,
      })
      answer = r.text.trim()
      inputTokens = r.inputTokens
      outputTokens = r.outputTokens
    } else {
      const result: any = await env.AI.run(route.id as any, {
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(userPayload, null, 2) },
        ],
        max_tokens: 800,
      })
      answer = String(
        result?.choices?.[0]?.message?.content ??
        result?.response ?? ''
      ).trim()
      inputTokens = result?.usage?.prompt_tokens ?? 0
      outputTokens = result?.usage?.completion_tokens ?? 0
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Bounce LLM call failed: ${err?.message || String(err)}` }, { status: 502 })
  }

  if (!answer) {
    return NextResponse.json({ error: 'LLM returned empty response' }, { status: 502 })
  }

  // Persist Q + A as two cluster_insights rows tagged with this run.
  try {
    await run(db,
      `INSERT INTO cluster_insights
         (id, cluster_id, kind, title, body, bounce_run_id, surfaced)
       VALUES (?, ?, 'gap_question', 'operator', ?, ?, 0)`,
      ulid(), params.id, question, bounce_run_id,
    )
    await run(db,
      `INSERT INTO cluster_insights
         (id, cluster_id, kind, title, body, bounce_run_id, surfaced)
       VALUES (?, ?, 'evidence', ?, ?, ?, 0)`,
      ulid(), params.id, route.id, answer, bounce_run_id,
    )
    await run(db,
      `UPDATE bounce_runs SET completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      bounce_run_id,
    )
  } catch (e: any) {
    console.warn(`[bounce] insert failed: ${e?.message || e}`)
  }

  return NextResponse.json({
    ok: true,
    bounce_run_id,
    answer,
    model: route.id,
    tokens: { in: inputTokens, out: outputTokens },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

function safeFirstQuote(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      const f = parsed[0]
      return typeof f === 'string' ? f : (f?.text ?? null)
    }
  } catch {}
  return null
}
