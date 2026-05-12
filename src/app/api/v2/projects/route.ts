export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

const TOPIC_CYCLE = ['plum', 'rose', 'steel', 'teal', 'ochre', 'violet', 'sage']

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const rows = await findMany<{
    id: string
    name: string
    tagline: string | null
    blurb: string | null
    state: string
    last_activity_at: string | null
    character_count: number
  }>(
    db,
    `SELECT p.id, p.name, p.tagline, p.blurb, p.state, p.last_activity_at,
            (SELECT COUNT(*) FROM characters WHERE project_id = p.id) AS character_count
       FROM projects p
      WHERE p.operator_id = ? AND p.deleted_at IS NULL
      ORDER BY p.last_activity_at DESC, p.created_at DESC`,
    operator.id,
  )

  const projects = rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    state: r.state as 'developing' | 'materializing' | 'produced' | 'dormant',
    headline: r.tagline || r.blurb?.split('.')[0] || r.name,
    blurb: r.blurb || '',
    topic: TOPIC_CYCLE[i % TOPIC_CYCLE.length],
    stats: [
      { label: 'Characters', value: String(r.character_count) },
    ],
    last_touched: r.last_activity_at ? `Last touched ${new Date(r.last_activity_at).toLocaleDateString()}` : 'New',
  }))

  return NextResponse.json({ projects })
}
