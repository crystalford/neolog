/**
 * GET /api/v2/search?q=<query>
 *
 * Lightweight typeahead search across the operator's corpus for the
 * CMD-K palette. Returns small unions of vlogs / threads / clusters
 * matching the query (case-insensitive LIKE).
 *
 * Cap each kind at 5 hits. Total payload tiny — designed for sub-100ms
 * round trip from the palette's onChange.
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
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    return NextResponse.json({ vlogs: [], threads: [], clusters: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const like = `%${q.replace(/[%_]/g, '\\$&')}%`

  const db = getDb(env)
  const [vlogs, threads, clusters] = await Promise.all([
    findMany<{ id: string; original_filename: string | null; recorded_at: string | null }>(
      db,
      `SELECT id, original_filename, recorded_at
         FROM vlogs
        WHERE operator_id = ? AND deleted_at IS NULL
          AND original_filename LIKE ? ESCAPE '\\'
        ORDER BY recorded_at DESC LIMIT 5`,
      operator.id, like,
    ).catch(() => []),
    findMany<{ id: string; topic: string; take: string | null; abstracted_topic: string | null }>(
      db,
      `SELECT id, topic, take, abstracted_topic
         FROM threads
        WHERE operator_id = ? AND deleted_at IS NULL
          AND (topic LIKE ? ESCAPE '\\' OR take LIKE ? ESCAPE '\\' OR abstracted_topic LIKE ? ESCAPE '\\')
        ORDER BY extracted_at DESC LIMIT 5`,
      operator.id, like, like, like,
    ).catch(() => []),
    findMany<{ id: string; topic: string; abstracted_topic: string | null; ripeness_score: number | null }>(
      db,
      `SELECT id, topic, abstracted_topic, ripeness_score
         FROM clusters
        WHERE operator_id = ? AND deleted_at IS NULL
          AND (topic LIKE ? ESCAPE '\\' OR abstracted_topic LIKE ? ESCAPE '\\')
        ORDER BY ripeness_score DESC LIMIT 5`,
      operator.id, like, like,
    ).catch(() => []),
  ])

  return NextResponse.json({
    vlogs: vlogs.map(v => ({ id: v.id, title: v.original_filename ?? v.id.slice(0, 14), date: v.recorded_at })),
    threads: threads.map(t => ({ id: t.id, topic: t.topic, take: t.take ?? '', abstracted_topic: t.abstracted_topic })),
    clusters: clusters.map(c => ({ id: c.id, label: c.abstracted_topic ?? c.topic, ripeness: c.ripeness_score ?? 0 })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
