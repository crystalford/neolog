/**
 * GET /api/v2/productions/[id]    — single production + source context
 * PATCH /api/v2/productions/[id]  — operator edits script_text / state
 * DELETE /api/v2/productions/[id] — soft delete
 *
 * Reads from the `productions` table (script_text, state machine).
 * Distinct from /api/v2/projects/[id] which serves Pack Rats-style
 * creative containers.
 *
 * GET response includes source context (thread or cluster) so the
 * draft page can show what's being drafted FROM in the rail.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

type ProductionRow = {
  id: string; operator_id: string
  production_type: string; source_kind: string; source_id: string
  state: string; state_changed_at: string
  script_text: string | null; script_version: number
  voice_profile_id: string | null
  form: string | null; length_magnitude: string | null
  prompt_version: string | null
  visibility: string
  published_to: string | null; engagement: string | null
  produced_at: string | null
  created_at: string; updated_at: string
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const prod = await findOne<ProductionRow>(
    db,
    `SELECT id, operator_id, production_type, source_kind, source_id, state, state_changed_at,
            script_text, script_version, voice_profile_id, form, length_magnitude,
            prompt_version, visibility, published_to, engagement, produced_at,
            created_at, updated_at
       FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!prod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Source context — what we drafted FROM.
  let source: any = null
  try {
    if (prod.source_kind === 'thread') {
      source = await findOne<any>(
        db,
        `SELECT t.id, t.topic, t.take, t.abstracted_topic, t.strength, t.transcript_span_start,
                t.transcript_span_end, t.vlog_id,
                v.original_filename AS vlog_filename
           FROM threads t
           JOIN vlogs v ON v.id = t.vlog_id
          WHERE t.id = ? AND t.operator_id = ?`,
        prod.source_id, operator.id,
      )
    } else if (prod.source_kind === 'cluster') {
      const c = await findOne<any>(
        db,
        `SELECT id, topic, abstracted_topic, take, ripeness_score, state
           FROM clusters
          WHERE id = ? AND operator_id = ?`,
        prod.source_id, operator.id,
      )
      if (c) {
        const threads = await findMany<any>(
          db,
          `SELECT t.id, t.topic, t.take, t.strength
             FROM threads t
             JOIN cluster_threads ct ON ct.thread_id = t.id
            WHERE ct.cluster_id = ? AND t.operator_id = ?
            ORDER BY t.strength DESC LIMIT 10`,
          prod.source_id, operator.id,
        )
        source = { ...c, threads }
      }
    }
  } catch {}

  return NextResponse.json({ production: prod, source })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const patch = await req.json().catch(() => ({})) as {
    script_text?: string
    state?: string
    visibility?: 'private' | 'public'
  }

  const existing = await findOne<{ id: string; script_version: number; script_text: string | null }>(
    db,
    `SELECT id, script_version, script_text FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fields: string[] = []
  const values: any[] = []
  if (typeof patch.script_text === 'string') {
    fields.push('script_text = ?', 'script_version = ?')
    values.push(patch.script_text, existing.script_version + 1)
  }
  if (patch.state && ['materializing','script_ready','recording','producing','produced','published','archived'].includes(patch.state)) {
    fields.push('state = ?', 'state_changed_at = CURRENT_TIMESTAMP')
    values.push(patch.state)
    if (patch.state === 'produced' || patch.state === 'published') {
      fields.push('produced_at = COALESCE(produced_at, CURRENT_TIMESTAMP)')
    }
  }
  if (patch.visibility === 'public' || patch.visibility === 'private') {
    fields.push('visibility = ?')
    values.push(patch.visibility)
  }
  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(params.id, operator.id)

  await db.prepare(
    `UPDATE productions SET ${fields.join(', ')} WHERE id = ? AND operator_id = ?`,
  ).bind(...values).run()

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  await db.prepare(
    `UPDATE productions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
  ).bind(params.id, operator.id).run()
  return NextResponse.json({ ok: true })
}
