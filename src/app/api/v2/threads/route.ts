/**
 * GET /api/v2/threads
 *
 * Full paginated threads list for the operator. Returns threads from
 * the currently-active extraction run per vlog (via JOIN extraction_runs
 * WHERE is_active=1) so re-extracted vlogs don't double-count.
 *
 * Query params:
 *   ?limit=  (default 100, max 500)
 *   ?offset= (default 0)
 *   ?topic=  filter by exact topic match (case-insensitive)
 *   ?vlog_id= filter to threads from one vlog
 *
 * Separate from /api/v2/threads/recent which is a 5-row "last 14 days"
 * summary used by the Capture page. This is the unbounded list endpoint
 * powering the /threads page.
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

  const url = new URL(req.url)
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10)
  const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100))
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const offset = Math.max(0, Number.isFinite(offsetRaw) ? offsetRaw : 0)
  const topic = url.searchParams.get('topic')
  const vlogId = url.searchParams.get('vlog_id')

  const db = getDb(env)

  // Build the WHERE clause incrementally — keep all parameters bound
  // as separate args (no string interpolation into SQL).
  const where: string[] = [
    't.operator_id = ?',
    't.deleted_at IS NULL',
    'er.is_active = 1',
  ]
  const args: any[] = [operator.id]
  if (topic) { where.push('lower(t.topic) = lower(?)'); args.push(topic) }
  if (vlogId) { where.push('t.vlog_id = ?'); args.push(vlogId) }
  args.push(limit, offset)

  const threads = await findMany<{
    id: string
    topic: string
    take: string | null
    register: string | null
    strength: number | null
    abstracted_topic: string | null
    key_quotes: string | null
    vlog_id: string
    vlog_filename: string | null
    vlog_recorded_at: string | null
    extracted_at: string
  }>(
    db,
    `SELECT t.id, t.topic, t.take, t.register, t.strength,
            t.abstracted_topic, t.key_quotes,
            t.vlog_id,
            v.original_filename AS vlog_filename,
            v.recorded_at AS vlog_recorded_at,
            t.extracted_at
       FROM threads t
       JOIN extraction_runs er ON er.id = t.run_id
       JOIN vlogs v ON v.id = t.vlog_id
      WHERE ${where.join(' AND ')}
        AND v.deleted_at IS NULL
      ORDER BY COALESCE(v.recorded_at, v.uploaded_at) DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    ...args,
  )

  // Total count (excluding the limit/offset) so the UI can show "N of M".
  const countArgs = args.slice(0, args.length - 2)
  const countWhere = where.join(' AND ')
  const total = await db.prepare(
    `SELECT COUNT(*) AS n
       FROM threads t
       JOIN extraction_runs er ON er.id = t.run_id
       JOIN vlogs v ON v.id = t.vlog_id
      WHERE ${countWhere}
        AND v.deleted_at IS NULL`,
  ).bind(...countArgs).first<{ n: number }>()

  return NextResponse.json({
    threads,
    total: total?.n ?? threads.length,
    limit,
    offset,
  })
}
