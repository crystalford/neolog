/**
 * POST /api/v2/topics/[id]/suggest-angles
 *
 * Given a topic, propose 4–6 specific video-essay angles. Each angle
 * comes with a one-line framing + 2-4 research questions the operator
 * can use to direct the piece.
 *
 * If the operator has saved a Brave Search key, the suggestions are
 * grounded in the top results for the topic (response.grounded=true);
 * without a key they're concept-only but still useful. Either way: one
 * gpt-oss-120b call (~10-15s).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { suggestTopicAngles, type ResearchEnv } from '@/lib/research'
import { loadOperatorProfile, formatOperatorProfile } from '@/lib/operator-profile'
import { run } from '@/lib/d1'
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
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({})) as { force?: boolean }
  const db = getDb(env)

  const topic = await findOne<{
    id: string; title: string; angle: string | null
    suggestions_json: string | null; suggestions_grounded: number | null
  }>(
    db,
    `SELECT id, title, angle, suggestions_json, suggestions_grounded
       FROM topics WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operator.id,
  )
  if (!topic) return NextResponse.json({ error: 'topic not found' }, { status: 404 })

  // Cache hit — instant. Unless ?force=true (operator hit Regenerate).
  if (!body.force && topic.suggestions_json) {
    try {
      const cached = JSON.parse(topic.suggestions_json)
      if (Array.isArray(cached) && cached.length > 0) {
        return NextResponse.json({
          suggestions: cached,
          grounded: topic.suggestions_grounded === 1,
          cached: true,
        }, { headers: { 'Cache-Control': 'no-store' } })
      }
    } catch {}
  }

  const op = await findOne<{ brave_search_api_key: string | null }>(
    db, `SELECT brave_search_api_key FROM operator WHERE id = ?`, operator.id,
  )

  // GRAPH-AWARE: every suggestion call now consults the operator's
  // profile + named subjects. The model proposes angles that connect to
  // (or deliberately avoid) what the operator already circles.
  const profile = await loadOperatorProfile(db, operator.id)
  const profileBlock = formatOperatorProfile(profile)

  const out = await suggestTopicAngles(env, {
    title: topic.title,
    angle: topic.angle,
    braveKey: op?.brave_search_api_key ?? null,
    profileBlock,
  })

  // Cache for instant revisit. Don't block the response on the write.
  try {
    await run(
      db,
      `UPDATE topics SET suggestions_json = ?, suggestions_grounded = ?,
                         updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      JSON.stringify(out.suggestions),
      out.grounded ? 1 : 0,
      id, operator.id,
    )
  } catch {}

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
