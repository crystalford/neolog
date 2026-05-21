/**
 * GET /api/p
 *
 * Public list of productions WHERE visibility='public'. Powers the
 * "Published work" section on the landing page + future public
 * gallery. No auth required.
 *
 * Returns lightweight metadata only — title, type, published_at,
 * attribution. Body text comes from /api/p/[id] when the visitor
 * clicks through.
 *
 * Cached briefly at the edge (60s) since this changes only when the
 * operator flips visibility on a production.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany } from '@/lib/d1'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

export async function GET(_req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const db = getDb(env)

  const rows = await findMany<{
    id: string
    production_type: string
    source_kind: string
    source_id: string
    form: string | null
    produced_at: string | null
    created_at: string
    operator_handle: string | null
  }>(
    db,
    `SELECT p.id, p.production_type, p.source_kind, p.source_id, p.form,
            p.produced_at, p.created_at,
            o.name AS operator_handle
       FROM productions p
       JOIN operator o ON o.id = p.operator_id
      WHERE p.visibility = 'public' AND p.deleted_at IS NULL
      ORDER BY COALESCE(p.produced_at, p.created_at) DESC
      LIMIT 50`,
  )

  // Resolve titles in a batched-friendly way — for now, one query per
  // distinct source. Small list, cheap.
  const titles: Record<string, string> = {}
  await Promise.all(rows.map(async r => {
    try {
      if (r.source_kind === 'cluster') {
        const c = await db.prepare(
          `SELECT topic, abstracted_topic FROM clusters WHERE id = ?`
        ).bind(r.source_id).first<{ topic: string; abstracted_topic: string | null }>()
        titles[r.id] = c?.abstracted_topic ?? c?.topic ?? '(untitled)'
      } else if (r.source_kind === 'thread') {
        const t = await db.prepare(
          `SELECT topic FROM threads WHERE id = ?`
        ).bind(r.source_id).first<{ topic: string }>()
        titles[r.id] = t?.topic ?? '(untitled)'
      } else {
        titles[r.id] = '(untitled)'
      }
    } catch { titles[r.id] = '(untitled)' }
  }))

  return NextResponse.json({
    productions: rows.map(r => ({
      id: r.id,
      type: r.production_type,
      form: r.form,
      title: titles[r.id],
      attribution: r.operator_handle ?? 'unknown',
      published_at: r.produced_at ?? r.created_at,
    })),
  }, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
