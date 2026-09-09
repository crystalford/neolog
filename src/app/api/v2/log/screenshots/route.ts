/**
 * GET  /api/v2/log/screenshots — the pictures that are really text, in three
 *                                piles.
 * POST /api/v2/log/screenshots — bury a set of them. { ids: [...] }
 *
 * The sort is computed on read, never stored. A stored pile would go stale
 * the moment the rule changed, and a row that says "convenience" because an
 * older version of the rule thought so is a claim the log can no longer
 * check. `sortScreenshot` runs over `transcript` — the words the vision pass
 * read — every time.
 *
 * POST buries; it never deletes. `screenshots.html`: "Buried, not deleted:
 * it's still there if the 19th ever matters."
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { sortScreenshot, type Pile } from '@/lib/screenshots'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

async function operatorOr401(req: NextRequest, env: Env) {
  try { return { operator: await requireOperator(req, env), error: null as null } }
  catch (e) {
    if (e instanceof UnauthenticatedError) {
      return { operator: null, error: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
    }
    throw e
  }
}

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'screenshots')

  const rows = await findMany<{
    id: string; text: string; detail: string | null; transcript: string | null
    happened_at: string; date_precision: string; kind: string
    visibility: string; r: string | null; mime: string | null
  }>(
    db,
    `SELECT id, text, detail, transcript,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            COALESCE(date_precision, 'exact') AS date_precision,
            COALESCE(kind, 'seen') AS kind,
            COALESCE(visibility, 'public') AS visibility,
            r, mime
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND transcript IS NOT NULL AND transcript <> ''
        AND r IS NOT NULL
        AND mime LIKE 'image/%'
      ORDER BY COALESCE(happened_at, occurred_at, created_at) DESC
      LIMIT 300`,
    operator!.id,
  )

  // Only the rows that survive are signed — the same lesson the feed learned.
  const items = await Promise.all(rows.map(async r => {
    const sorted = sortScreenshot(r.transcript)
    let url: string | null = null
    try { if (r.r) url = await presignGetUrl(env, r.r, 24 * 3600) } catch { url = null }
    return {
      id: r.id,
      text: r.text,
      detail: r.detail,
      reads: r.transcript,
      happened_at: r.happened_at,
      date_precision: r.date_precision,
      // The kind on the row, and separately what the text reads as. They
      // can disagree — a row filed before the sort existed still says
      // `paperwork` — and showing both is how that becomes visible rather
      // than being quietly overwritten.
      entry_kind_now: r.kind,
      // A held picture is never shown here — the words were read before the
      // hold-back check released it, and a held row has no business on a
      // page that offers bulk actions.
      url: r.visibility === 'held' ? null : url,
      held: r.visibility === 'held',
      ...sorted,
    }
  }))

  const piles: Record<Pile, typeof items> = {
    something: items.filter(i => i.pile === 'something' && !i.held),
    keep: items.filter(i => i.pile === 'keep' && !i.held),
    convenience: items.filter(i => i.pile === 'convenience' && !i.held),
  }

  // `screenshots.html` §2: "Receipts, contracts, statements, the letter from
  // the clinic. The boring half of a life record, and it's a kind." Not only
  // screenshots — a PDF of a contract and a photo of a receipt are the same
  // kind, so this reads the kind rather than the mime. What, who, when, how
  // much: the first three are columns; the amount is pulled from the words
  // the vision pass read, and is absent when there are none.
  const paper = await findMany<{
    id: string; text: string; detail: string | null; transcript: string | null
    happened_at: string; date_precision: string; mime: string | null
  }>(
    db,
    `SELECT id, text, detail, transcript,
            COALESCE(happened_at, occurred_at, created_at) AS happened_at,
            COALESCE(date_precision, 'exact') AS date_precision, mime
       FROM log_entries
      WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        AND kind = 'paperwork'
      ORDER BY COALESCE(happened_at, occurred_at, created_at) DESC
      LIMIT 200`,
    operator!.id,
  )
  const paperwork = paper.map(r => {
    const sorted = sortScreenshot(r.transcript)
    return {
      id: r.id,
      text: r.text,
      detail: r.detail,
      happened_at: r.happened_at,
      date_precision: r.date_precision,
      what: sorted.facts.what || 'paperwork',
      who: sorted.facts.who || null,
      amount: sorted.facts.amount || null,
      mime: r.mime,
    }
  })

  return NextResponse.json(
    { piles, paperwork, total: items.length },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  const { operator, error } = await operatorOr401(req, env)
  if (error) return error
  const db = await readyDb(getDb(env), 'screenshots')

  const body = await req.json().catch(() => ({})) as { ids?: string[] }
  const ids = (body.ids || []).filter(x => typeof x === 'string' && x).slice(0, 500)
  if (!ids.length) return NextResponse.json({ error: 'nothing named' }, { status: 400 })

  const ph = ids.map(() => '?').join(',')
  const res: any = await run(
    db,
    `UPDATE log_entries SET buried_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE operator_id = ? AND buried_at IS NULL AND id IN (${ph})`,
    operator!.id, ...ids,
  )
  return NextResponse.json(
    { buried: res?.meta?.changes ?? 0 },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
