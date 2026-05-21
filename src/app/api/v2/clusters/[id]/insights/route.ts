/**
 * POST /api/v2/clusters/[id]/insights
 *
 * Adds an operator-authored insight to a cluster. Three kinds from
 * the UI, all stored under the existing CHECK-constrained schema kind
 * 'framework' (operator framing the cluster). The shape (note vs
 * quote vs reference) is preserved via source_label and source_url:
 *
 *   - note:      body only.                source_label = 'operator'
 *   - quote:     body + attribution.       source_label = citation,    source_url null
 *   - reference: body + URL + title.       source_label = title,       source_url = URL
 *
 * All three render alongside cultivate-generated insights on the
 * cluster page, distinguishable by source_label/source_url so the UI
 * can mark them as operator-added.
 *
 * Request: { kind: 'note' | 'quote' | 'reference', body: string,
 *            title?: string, source_label?: string, source_url?: string }
 * Response: { insight: { id, kind, title, body, source_label, source_url,
 *                         bounce_run_id, created_at } }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const db = getDb(env)
  const cluster = await findOne<{ id: string }>(
    db,
    `SELECT id FROM clusters WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!cluster) return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    kind?: 'note' | 'quote' | 'reference'
    body?: string
    title?: string
    source_label?: string
    source_url?: string
  }

  const uiKind = body.kind ?? 'note'
  const text = (body.body || '').trim()
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })
  if (uiKind !== 'note' && uiKind !== 'quote' && uiKind !== 'reference') {
    return NextResponse.json({ error: "kind must be 'note', 'quote', or 'reference'" }, { status: 400 })
  }

  // Map UI kind onto the schema CHECK-constrained kind, and pack
  // provenance into source_label/source_url so the UI can distinguish.
  const dbKind = 'framework'
  const sourceLabel = uiKind === 'note'
    ? 'operator'
    : (body.source_label || (uiKind === 'quote' ? 'external quote' : 'reference'))
  const sourceUrl = uiKind === 'reference' ? (body.source_url || null) : null

  const id = `ins_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  await db.prepare(
    `INSERT INTO cluster_insights (id, cluster_id, kind, title, body, source_label, source_url, surfaced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
  ).bind(id, params.id, dbKind, body.title || null, text, sourceLabel, sourceUrl).run()

  await db.prepare(
    `UPDATE clusters SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND operator_id = ?`,
  ).bind(params.id, operator.id).run()

  return NextResponse.json({
    insight: {
      id, kind: dbKind, ui_kind: uiKind,
      title: body.title || null, body: text,
      source_label: sourceLabel, source_url: sourceUrl,
      bounce_run_id: null,
      created_at: new Date().toISOString(),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
