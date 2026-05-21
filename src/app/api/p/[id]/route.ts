/**
 * GET /api/p/[id]
 *
 * Public production endpoint — no auth required. Returns a production
 * row WHERE visibility='public' AND deleted_at IS NULL. 404 otherwise.
 *
 * The shape returned is the operator-safe subset: production content,
 * title/headline (derived), published_at, source kind/id for footnotes.
 * Does NOT return: operator_id, internal cost, prompt versions, draft
 * states. The public face shouldn't leak the working-side state.
 *
 * Lives outside the (app) route group + the /v2/admin pattern, so it
 * skips requireOperator() entirely. Cloudflare Access policy needs
 * /p/* and /api/p/* added to the public exclusion list in the
 * dashboard.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database }

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  const db = getDb(env)

  const row = await findOne<{
    id: string
    production_type: string
    state: string
    visibility: string
    source_kind: string
    source_id: string
    script_text: string | null
    form: string | null
    length_magnitude: string | null
    published_to: string | null
    engagement: string | null
    produced_at: string | null
    created_at: string
    operator_handle: string | null
  }>(
    db,
    `SELECT p.id, p.production_type, p.state, p.visibility, p.source_kind, p.source_id,
            p.script_text, p.form, p.length_magnitude, p.published_to, p.engagement,
            p.produced_at, p.created_at,
            o.name AS operator_handle
       FROM productions p
       JOIN operator o ON o.id = p.operator_id
      WHERE p.id = ? AND p.visibility = 'public' AND p.deleted_at IS NULL`,
    params.id,
  )

  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Derive a title — productions don't have a stored title yet; pull
  // it from the source cluster/thread.
  let title: string | null = null
  let attribution: string | null = null
  try {
    if (row.source_kind === 'cluster') {
      const c = await findOne<{ topic: string; abstracted_topic: string | null }>(
        db,
        `SELECT topic, abstracted_topic FROM clusters WHERE id = ?`,
        row.source_id,
      )
      title = c?.abstracted_topic ?? c?.topic ?? null
    } else if (row.source_kind === 'thread') {
      const t = await findOne<{ topic: string }>(
        db,
        `SELECT topic FROM threads WHERE id = ?`,
        row.source_id,
      )
      title = t?.topic ?? null
    }
  } catch {}
  attribution = row.operator_handle ?? 'unknown'

  return NextResponse.json({
    production: {
      id: row.id,
      type: row.production_type,
      state: row.state,
      form: row.form,
      length: row.length_magnitude,
      title,
      attribution,
      body: row.script_text ?? '',
      published_to: row.published_to,
      engagement: row.engagement ? safeJson(row.engagement) : null,
      produced_at: row.produced_at,
      created_at: row.created_at,
    },
  }, {
    headers: {
      // Public content can be cached briefly at the edge — operator
      // changes visibility infrequently and a 60s stale window is fine.
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}

function safeJson(s: string): any {
  try { return JSON.parse(s) } catch { return null }
}
