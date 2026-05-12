/**
 * GET /api/v2/library
 *
 * Finished productions for the Library gallery. Pulls from productions
 * (video essays, articles, x_threads, x_posts, creative_works) and from
 * clip_candidates that have been published.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
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
  const db = getDb(env)

  const prods = await findMany<{
    id: string
    production_type: string
    state: string
    produced_at: string | null
    created_at: string
    script_text: string | null
  }>(
    db,
    `SELECT id, production_type, state, produced_at, created_at, script_text
       FROM productions
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY produced_at DESC NULLS LAST, created_at DESC
      LIMIT 200`,
    operator.id,
  )

  const clips = await findMany<{
    id: string
    headline: string
    quote: string | null
    start_time: number
    end_time: number
    status: string
    extracted_at: string
  }>(
    db,
    `SELECT id, headline, quote, start_time, end_time, status, extracted_at
       FROM clip_candidates
      WHERE operator_id = ? AND status = 'published'
      ORDER BY extracted_at DESC
      LIMIT 200`,
    operator.id,
  )

  const productions = [
    ...prods.map(p => ({
      id: p.id,
      kind: p.production_type,
      headline: p.script_text ? p.script_text.split('\n')[0].slice(0, 80) : null,
      thumbnail_url: null,
      duration_seconds: null,
      state: p.state,
      published_at: p.produced_at,
      created_at: p.created_at,
    })),
    ...clips.map(c => ({
      id: c.id,
      kind: 'clip',
      headline: c.headline,
      thumbnail_url: null,
      duration_seconds: c.end_time - c.start_time,
      state: c.status,
      published_at: null,
      created_at: c.extracted_at,
    })),
  ]

  productions.sort((a, b) => (b.published_at || b.created_at).localeCompare(a.published_at || a.created_at))

  return NextResponse.json({ productions })
}
