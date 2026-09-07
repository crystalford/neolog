/**
 * PATCH /api/v2/log/[id] — correcting an entry.
 *
 * SPEC §1 (`wrong.html`): the log guesses roughly twenty times a day, and it
 * cannot be built on being right — it is built on being cheap to correct.
 * The fix lives where the mistake is: no settings screen, no review queue, no
 * confirmation dialog. Every field here corresponds to one tap on a row.
 *
 * Body — any subset:
 *   { text }                          the operator rewriting his own line
 *   { happened_at, date_precision }   wrong date; a year alone is a valid fix
 *   { visibility }                    publish something held, or hold one back
 *   { buried }                        bury / dig up
 *
 * Nothing here deletes. Burial keeps the row, the file and the relationships,
 * and removes it from the feed, from search and from the counts. Digging up
 * is itself an event.
 *
 * Publishing a held entry takes the operator's word for it — being wrong
 * towards private is the only safe direction, and the operator overriding is
 * the correction, not a second opinion to be checked.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { DatePrecision, Visibility } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

const PRECISIONS = new Set<DatePrecision>(['exact', 'day', 'month', 'year', 'approx'])
const VISIBILITIES = new Set<Visibility>(['public', 'private', 'held'])

/**
 * GET /api/v2/log/[id] — one entry, whole.
 *
 * The entry page IS the expansion (SPEC §11) — there is no expand-in-place
 * gesture — so this returns everything the row didn't show: the transcript,
 * the file behind it, both dates, and who wrote each line.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const row = await findOne<{
    id: string; text: string; detail: string | null
    occurred_at: string; created_at: string; updated_at: string
    happened_at: string | null; logged_at: string | null
    date_precision: string; kind: string; visibility: string
    held_reason: string | null; author: string; source_kind: string
    batch_id: string | null; buried_at: string | null
    r2_key: string | null; mime: string | null; bytes: number | null
    duration_seconds: number | null; transcript: string | null
    link_url: string | null; original_filename: string | null
  }>(
    db,
    `SELECT id, text, detail, occurred_at, created_at, updated_at, happened_at,
            logged_at, date_precision, kind, visibility, held_reason, author,
            source_kind, batch_id, buried_at, r2_key, mime, bytes,
            duration_seconds, transcript, link_url, original_filename
       FROM log_entries
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let media_url: string | null = null
  if (row.r2_key) {
    try { media_url = await presignGetUrl(env, row.r2_key, 24 * 3600) } catch {}
  }

  return NextResponse.json(
    {
      ...row,
      happened_at: row.happened_at || row.occurred_at || row.created_at,
      logged_at: row.logged_at || row.created_at,
      media_url,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
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
  const id = params.id

  const existing = await findOne<{ id: string }>(
    db,
    `SELECT id FROM log_entries WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operator.id,
  )
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    text?: string
    happened_at?: string
    date_precision?: string
    visibility?: string
    buried?: boolean
  }

  const sets: string[] = []
  const binds: unknown[] = []

  // The operator rewriting his own line. Both wordings are his; the entry
  // keeps the new one and `author` stays `operator` either way.
  if (typeof body.text === 'string') {
    const t = body.text.trim()
    if (!t) return NextResponse.json({ error: 'text cannot be emptied — bury it instead' }, { status: 400 })
    if (t.length > 100_000) return NextResponse.json({ error: 'text too long' }, { status: 400 })
    sets.push('text = ?', "author = 'operator'")
    binds.push(t)
  }

  // Wrong date. A year on its own is a complete answer, not a partial one.
  if (body.happened_at !== undefined) {
    const d = new Date(body.happened_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'happened_at is not a valid date' }, { status: 400 })
    const p = body.date_precision as DatePrecision
    sets.push('happened_at = ?', 'occurred_at = ?', 'date_precision = ?')
    binds.push(d.toISOString(), d.toISOString(), PRECISIONS.has(p) ? p : 'day')
  } else if (body.date_precision !== undefined) {
    const p = body.date_precision as DatePrecision
    if (!PRECISIONS.has(p)) return NextResponse.json({ error: 'unknown date_precision' }, { status: 400 })
    sets.push('date_precision = ?')
    binds.push(p)
  }

  // Publishing something the log held back, or holding one back by hand.
  // When the operator publishes, the log's stated reason goes with it — it
  // was the log's read, and it has been overruled.
  if (body.visibility !== undefined) {
    const v = body.visibility as Visibility
    if (!VISIBILITIES.has(v)) return NextResponse.json({ error: 'unknown visibility' }, { status: 400 })
    sets.push('visibility = ?')
    binds.push(v)
    if (v !== 'held') sets.push('held_reason = NULL')
  }

  // Bury / dig up. Burying a public entry also unpublishes it (SPEC §1).
  if (body.buried !== undefined) {
    if (body.buried) {
      sets.push('buried_at = CURRENT_TIMESTAMP', "visibility = 'private'")
    } else {
      sets.push('buried_at = NULL')
    }
  }

  if (!sets.length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })

  sets.push('updated_at = CURRENT_TIMESTAMP')
  binds.push(id, operator.id)
  await run(db, `UPDATE log_entries SET ${sets.join(', ')} WHERE id = ? AND operator_id = ?`, ...binds)

  return NextResponse.json({ ok: true, id }, { headers: { 'Cache-Control': 'no-store' } })
}
