/**
 * POST /api/v2/topics/[id]/research
 *
 * Run the research pass for a topic. Pulls pasted URLs from
 * topics.pasted_urls_json, optionally auto-searches via Brave (when the
 * operator has saved a key), crawls everything via Cloudflare Browser Run,
 * synthesizes a brief with gpt-oss-120b, writes it to topics.research_brief.
 *
 * Sequential per-source so the (forthcoming) progress poll surfaces real
 * per-source state. body: { mode?: 'pasted_only' | 'auto_only' | 'both' }
 * default mode is 'both' — pasted URLs win, auto-search fills remainder.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { researchTopic, type ResearchEnv } from '@/lib/research'
import { loadOperatorProfile, formatOperatorProfile } from '@/lib/operator-profile'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends ResearchEnv {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const { id: topicId } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    mode?: 'pasted_only' | 'auto_only' | 'both'
  }
  const mode = body.mode ?? 'both'

  const db = getDb(env)
  const topic = await findOne<{
    id: string; title: string; angle: string | null; notes: string | null
    pasted_urls_json: string | null
  }>(
    db,
    `SELECT id, title, angle, notes, pasted_urls_json
       FROM topics WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    topicId, operator.id,
  )
  if (!topic) return NextResponse.json({ error: 'topic not found' }, { status: 404 })

  const op = await findOne<{ brave_search_api_key: string | null }>(
    db, `SELECT brave_search_api_key FROM operator WHERE id = ?`, operator.id,
  )
  let pastedUrls: string[] = []
  try { pastedUrls = topic.pasted_urls_json ? JSON.parse(topic.pasted_urls_json) : [] } catch {}

  // Mark in flight; reset prior research_status.
  await run(db, `UPDATE topics SET research_status = 'researching', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, topicId)

  try {
    const profile = await loadOperatorProfile(db, operator.id)
    const profileBlock = formatOperatorProfile(profile)
    const result = await researchTopic(env, {
      topicId, operatorId: operator.id,
      title: topic.title, angle: topic.angle, notes: topic.notes,
      pastedUrls,
      braveKey: op?.brave_search_api_key ?? null,
      mode,
      profileBlock,
    })
    await run(
      db,
      `UPDATE topics
          SET research_brief = ?, research_status = ?, research_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      result.brief, result.status, topicId, operator.id,
    )
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    await run(
      db,
      `UPDATE topics SET research_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      topicId,
    )
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
