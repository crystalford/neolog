/**
 * GET  /api/v2/admin/headlines   — how many recordings have a line, and a sample
 * POST /api/v2/admin/headlines   — write the next batch of them
 *
 * The operator has no terminal, so a maintenance job that would be a script
 * anywhere else is an HTTP endpoint here. This one is the backfill behind
 * Settings → "say what each recording is about": it writes
 * `vlogs.headline` from the recording's own transcript, a bounded batch per
 * call, and reports what is left so the panel can press again.
 *
 * ⚠️ Read `src/lib/headline.ts` before changing anything here. A model
 * writing a sentence is the thing this product refuses hardest, and the
 * reason this one is allowed — it replaces a line the log already wrote,
 * keeps the log's signature on it, and never touches a word of his — is
 * written out in full at the top of that file.
 *
 * GET is read-only and costs nothing. POST costs one model call per
 * recording in the batch, which is why the batch is small and the caller
 * decides how many times to press.
 */

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getDb, findOne, findMany, run } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { headlineBacklog, recleanHeadlines, type HeadlineEnv } from '@/lib/headline'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: { run: (m: unknown, a: unknown) => Promise<unknown> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

/** One call writes at most this many. */
const MAX_BATCH = 10

export async function GET(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  // ⚠️ `headline` and `headline_at` landed in this deploy, so the read has to
  // wait for the migration rather than race it (src/lib/ready-db.ts).
  const db = await readyDb(getDb(env), 'admin/headlines')

  const counts = await findOne<{ recordings: number; with_words: number; written: number; looked: number }>(
    db,
    `SELECT COUNT(*) AS recordings,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM transcript_words w WHERE w.vlog_id = v.id)
                     THEN 1 ELSE 0 END) AS with_words,
            SUM(CASE WHEN v.headline IS NOT NULL THEN 1 ELSE 0 END) AS written,
            SUM(CASE WHEN v.headline_at IS NOT NULL THEN 1 ELSE 0 END) AS looked
       FROM vlogs v
      WHERE v.operator_id = ? AND v.deleted_at IS NULL`,
    operator.id,
  )

  // The lines themselves, so they can be read before the rest are written.
  // This is the whole point of running ten first.
  const url = new URL(req.url)
  const sample = Math.min(50, Math.max(0, parseInt(url.searchParams.get('sample') || '0', 10) || 0))
  const lines = sample > 0
    ? await findMany<{ id: string; headline: string; original_filename: string | null }>(
        db,
        `SELECT id, headline, original_filename FROM vlogs
          WHERE operator_id = ? AND deleted_at IS NULL AND headline IS NOT NULL
          ORDER BY headline_at DESC
          LIMIT ?`,
        operator.id, sample,
      )
    : []

  const withWords = counts?.with_words ?? 0
  const looked = counts?.looked ?? 0
  return NextResponse.json({
    recordings: counts?.recordings ?? 0,
    with_words: withWords,
    written: counts?.written ?? 0,
    // Looked at and had nothing to say — stamped so it is not asked again.
    nothing_to_say: Math.max(0, looked - (counts?.written ?? 0)),
    left: Math.max(0, withWords - looked),
    lines,
  })
}

export async function POST(req: NextRequest) {
  const env = getCloudflareContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => ({})) as {
    limit?: number; ask_again?: boolean; reclean?: boolean
  }
  const limit = Math.min(MAX_BATCH, Math.max(1, body.limit ?? 5))

  const db = await readyDb(getDb(env), 'admin/headlines')

  // ⚠️ `clean()` has been wrong three times and each time the wrong lines
  // were already on the feed. Fixing the function does nothing for a line
  // already in the column, so this re-reads every one of them against the
  // current rules. It re-cleans; it does not re-ask — see the note on
  // `recleanHeadlines`.
  const recleaned = body.reclean
    ? await recleanHeadlines(db, operator.id)
    : null

  // ⚠️ `ask_again` clears the stamp on recordings the model looked at and had
  // nothing to say about, so the backlog picks them up once more. It exists
  // for one situation: the PROMPT changed, and the old one's silences say
  // nothing about the new one. It is not a retry loop — asking the same
  // question repeatedly eventually produces an answer by persistence rather
  // than by reading, which is why `headline_at` is stamped in the first
  // place. Nothing calls this on a schedule and nothing should.
  let asked_again = 0
  if (body.ask_again) {
    const r = await run(
      db,
      `UPDATE vlogs SET headline_at = NULL
        WHERE operator_id = ? AND deleted_at IS NULL
          AND headline IS NULL AND headline_at IS NOT NULL`,
      operator.id,
    )
    asked_again = (r as { meta?: { changes?: number } })?.meta?.changes ?? 0
  }
  const result = await headlineBacklog(env as unknown as HeadlineEnv, db, operator.id, limit)

  // What was just written, in words — a count alone cannot be checked.
  const lines = await findMany<{ id: string; headline: string }>(
    db,
    `SELECT id, headline FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL AND headline IS NOT NULL
      ORDER BY headline_at DESC
      LIMIT ?`,
    operator.id, limit,
  )

  return NextResponse.json({ ...result, asked_again, recleaned, lines })
}
