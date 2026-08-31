/**
 * GET /api/v2/photos/series
 *
 * Detects candidate photo "series" — vision tags that recur across multiple
 * photos spanning multiple days. These are the progress stories worth
 * turning into a time-lapse or before/after (e.g. "strength training"
 * photographed weekly). The /photos page offers a one-tap build for each.
 *
 * Uses SQLite json_each to unnest the vision_tags JSON array per photo, then
 * counts photos + distinct days per tag.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

// Skip generic tags that would produce meaningless "series".
const STOP_TAGS = new Set([
  'a person', 'two people', 'people', 'person', 'indoor', 'outdoor', 'photo',
  'selfie', 'day', 'night', 'inside', 'outside', 'man', 'woman',
])

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  try {
    const { ensureMigrationsOnce } = await import('@/lib/migration-runner')
    await ensureMigrationsOnce(db)
  } catch {}

  let rows: { tag: string; n: number; days: number }[] = []
  try {
    rows = await findMany<{ tag: string; n: number; days: number }>(
      db,
      `SELECT tag.value AS tag,
              COUNT(*) AS n,
              COUNT(DISTINCT date(COALESCE(p.taken_at, p.created_at))) AS days
         FROM photos p, json_each(p.vision_tags) AS tag
        WHERE p.operator_id = ? AND p.deleted_at IS NULL
          AND p.vision_tags IS NOT NULL AND p.vision_tags != ''
        GROUP BY tag.value
        HAVING n >= 3 AND days >= 2
        ORDER BY n DESC
        LIMIT 30`,
      operator.id,
    )
  } catch (err: any) {
    console.warn(`[photos/series] json_each query failed: ${err?.message || err}`)
    return NextResponse.json({ series: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const series = rows
    .filter(r => !STOP_TAGS.has(String(r.tag).toLowerCase()))
    .slice(0, 12)
    .map(r => ({ tag: r.tag, photo_count: r.n, day_span: r.days }))

  return NextResponse.json({ series }, { headers: { 'Cache-Control': 'no-store' } })
}
