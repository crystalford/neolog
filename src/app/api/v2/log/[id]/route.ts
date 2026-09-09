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
import { getDb, findOne, findMany, run, batch as d1Batch } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { ulid } from '@/lib/ulid'
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
  const db = await readyDb(getDb(env), 'entry')

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
    vlog_id: string | null; source_ref: string | null
    span_start: number | null; span_end: number | null; grounded: number | null
    led_from: string | null; transcript_segments: string | null
  }>(
    db,
    `SELECT id, text, detail, occurred_at, created_at, updated_at, happened_at,
            logged_at, date_precision, kind, visibility, held_reason, author,
            source_kind, batch_id, buried_at, r2_key, mime, bytes,
            duration_seconds, transcript, link_url, original_filename,
            vlog_id, source_ref, span_start, span_end, grounded, led_from,
            transcript_segments
       FROM log_entries
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Both versions kept, dated, marked revised by you (SPEC §1). An entry
  // that has been corrected carries its own history.
  // ⚠️ `by_whom` travels with the row. Some of these the log made — it
  // rebuilds an entry from the transcript after he fixes a misheard word —
  // and a line the log wrote is marked as the log's, always (§0 rule 3).
  const revisions = await findMany<{
    field: string; old_value: string | null; new_value: string | null
    created_at: string; by_whom: string | null
  }>(
    db,
    `SELECT field, old_value, new_value, created_at, by_whom FROM entry_revisions
      WHERE entry_id = ? AND operator_id = ?
      ORDER BY created_at DESC LIMIT 50`,
    params.id, operator.id,
  )

  // Both directions of the thread. A thread is `led_from` followed either
  // way — there is no thread object to fetch.
  const [cameFrom, ledTo] = await Promise.all([
    row.led_from
      ? findMany<{ id: string; text: string; happened_at: string; occurred_at: string; date_precision: string }>(
          db,
          `SELECT id, text, COALESCE(happened_at, occurred_at) AS happened_at,
                  occurred_at, date_precision
             FROM log_entries
            WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
          row.led_from, operator.id,
        )
      : Promise.resolve([]),
    findMany<{ id: string; text: string; happened_at: string; occurred_at: string; date_precision: string }>(
      db,
      `SELECT id, text, COALESCE(happened_at, occurred_at) AS happened_at,
              occurred_at, date_precision
         FROM log_entries
        WHERE led_from = ? AND operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        ORDER BY COALESCE(happened_at, occurred_at) ASC
        LIMIT 20`,
      params.id, operator.id,
    ),
  ])

  // The entries either side of this one, so the way out of an entry is not
  // only back up to the crumb. `.ends` in the design: earlier · the log ·
  // later.
  const at = row.happened_at || row.occurred_at || row.created_at
  const [earlier, later] = await Promise.all([
    findMany<{ id: string; text: string }>(
      db,
      `SELECT id, text FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
          AND COALESCE(happened_at, occurred_at) < ?
        ORDER BY COALESCE(happened_at, occurred_at) DESC LIMIT 1`,
      operator.id, at,
    ),
    findMany<{ id: string; text: string }>(
      db,
      `SELECT id, text FROM log_entries
        WHERE operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
          AND COALESCE(happened_at, occurred_at) > ?
        ORDER BY COALESCE(happened_at, occurred_at) ASC LIMIT 1`,
      operator.id, at,
    ),
  ])

  // The three cells at the foot of every entry, whatever kind it is
  // (`expanded.html` — "one shape"): where it came from, what it is
  // connected to, and what came out of it. The third had no data path at
  // all, and the second none on this page.
  const [onPages, copies] = await Promise.all([
    findMany<{ id: string; name: string; kind: string }>(
      db,
      `SELECT p.id, p.name, p.kind
         FROM page_entries pe
         JOIN pages p ON p.id = pe.page_id
        WHERE pe.entry_id = ? AND pe.entry_kind = 'entry'
          AND p.operator_id = ? AND p.deleted_at IS NULL AND p.merged_into IS NULL
        ORDER BY p.name ASC LIMIT 12`,
      params.id, operator.id,
    ),
    // Exact re-arrivals of the same file, which are sources rather than
    // entries of their own.
    findMany<{ id: string; logged_at: string }>(
      db,
      `SELECT id, COALESCE(logged_at, created_at) AS logged_at
         FROM log_entries
        WHERE copy_of = ? AND operator_id = ? AND deleted_at IS NULL`,
      params.id, operator.id,
    ),
  ])

  // ⚠️ A HELD entry is not presigned at all.
  //
  // The page used to receive the URL and put `class="blur"` on the image —
  // so the bytes were in the response, the browser fetched them, and the
  // only thing between the operator and a file the log has NOT LOOKED AT was
  // a CSS filter. The audio and video branches did not even blur; they
  // rendered a live `src`.
  //
  // SPEC §0.2: being wrong towards private is the only safe direction, and
  // every failure path holds back. `LogRow` has withheld the picture since
  // the feed was built. This is the same rule, one surface later, and it is
  // enforced HERE rather than in the page — a client cannot show what it was
  // never sent.
  let media_url: string | null = null
  if (row.r2_key && row.visibility !== 'held') {
    try { media_url = await presignGetUrl(env, row.r2_key, 24 * 3600) } catch {}
  }

  return NextResponse.json(
    {
      ...row,
      happened_at: row.happened_at || row.occurred_at || row.created_at,
      logged_at: row.logged_at || row.created_at,
      media_url,
      revisions,
      came_from: cameFrom[0] || null,
      led_to: ledTo,
      earlier: earlier[0] || null,
      later: later[0] || null,
      on_pages: onPages,
      copies,
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
  const db = await readyDb(getDb(env), 'entry')
  const id = params.id

  // Read what is there first: nothing may be overwritten without the old
  // value being kept. "A correction changes what things mean, never what was
  // said" (SPEC §1).
  const existing = await findOne<{
    id: string; text: string; happened_at: string | null; occurred_at: string
    date_precision: string; visibility: string; buried_at: string | null
    transcript: string | null; source_kind: string; author: string
    detail: string | null
  }>(
    db,
    `SELECT id, text, happened_at, occurred_at, date_precision, visibility,
            buried_at, transcript, source_kind, author, detail
       FROM log_entries WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    id, operator.id,
  )
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Every correction is itself a dated record, so the log keeps an account of
  // its own mistakes and the error rate is readable by kind over time.
  const revisions: { sql: string; binds: unknown[] }[] = []
  const note = (field: string, oldValue: string | null, newValue: string | null) => {
    if (oldValue === newValue) return
    revisions.push({
      sql: `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value)
            VALUES (?,?,?,?,?,?)`,
      binds: [ulid(), operator.id, id, field, oldValue, newValue],
    })
  }

  const body = await req.json().catch(() => ({})) as {
    text?: string
    /**
     * What the picture shows, in his words instead of the log's
     * (`image.html`: "what it shows marked as the operator's or the log's").
     * It has no author column of its own and does not need one: once a
     * `detail` revision exists, the line was his, and that is derivable
     * rather than stored twice.
     */
    detail?: string
    happened_at?: string
    date_precision?: string
    visibility?: string
    buried?: boolean
    /** 'operator' when he says a line the log wrote is actually his. */
    author?: string
    /**
     * "Wrong split → merge, thread intact" (`wrong.html`). This entry's
     * words join the target's and this one is buried, so nothing is lost and
     * the take it came from is untouched.
     */
    merge_into?: string
  }

  const sets: string[] = []
  const binds: unknown[] = []

  // The operator rewriting his own line. Both wordings are his; the entry
  // keeps the new one and `author` stays `operator` either way.
  if (typeof body.text === 'string') {
    const t = body.text.trim()
    if (!t) return NextResponse.json({ error: 'text cannot be emptied — bury it instead' }, { status: 400 })
    if (t.length > 100_000) return NextResponse.json({ error: 'text too long' }, { status: 400 })
    // Both wordings kept. The previous one goes into the revision record
    // before the column is touched.
    note('text', existing.text, t)
    // `grounded` means "this text IS the transcript's words for this span".
    // Once he has rewritten the line it is not, and a later fix to a misheard
    // word in the same span would otherwise rebuild the entry from the
    // transcript and put the machine's wording back over his.
    sets.push('text = ?', "author = 'operator'", 'grounded = 0')
    binds.push(t)
    // A voice entry's text IS its transcript — Whisper wrote both. Fixing a
    // misheard word in one and leaving the other is how the entry ends up
    // showing the correction above and the error below it, forever.
    if (existing.transcript && existing.transcript.trim() === existing.text.trim()) {
      sets.push('transcript = ?')
      binds.push(t)
    }
  }

  // Wrong date. A year on its own is a complete answer, not a partial one.
  // Replacing the log's description of a picture with his own. The log's
  // wording goes into the revision record first, so the entry can always
  // show what it used to say it saw.
  if (typeof body.detail === 'string') {
    const d = body.detail.trim()
    if (d.length > 20_000) return NextResponse.json({ error: 'that is too long' }, { status: 400 })
    note('detail', existing.detail ?? null, d || null)
    sets.push('detail = ?')
    binds.push(d || null)
  }

  if (body.happened_at !== undefined) {
    const d = new Date(body.happened_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'happened_at is not a valid date' }, { status: 400 })
    const p = body.date_precision as DatePrecision
    const prec = PRECISIONS.has(p) ? p : 'day'
    note('date',
      `${existing.happened_at || existing.occurred_at} (${existing.date_precision})`,
      `${d.toISOString()} (${prec})`)
    sets.push('happened_at = ?', 'occurred_at = ?', 'date_precision = ?')
    binds.push(d.toISOString(), d.toISOString(), prec)
  } else if (body.date_precision !== undefined) {
    const p = body.date_precision as DatePrecision
    if (!PRECISIONS.has(p)) return NextResponse.json({ error: 'unknown date_precision' }, { status: 400 })
    note('date', existing.date_precision, p)
    sets.push('date_precision = ?')
    binds.push(p)
  }

  // Publishing something the log held back, or holding one back by hand.
  // When the operator publishes, the log's stated reason goes with it — it
  // was the log's read, and it has been overruled.
  if (body.visibility !== undefined) {
    const v = body.visibility as Visibility
    if (!VISIBILITIES.has(v)) return NextResponse.json({ error: 'unknown visibility' }, { status: 400 })
    note('visibility', existing.visibility, v)
    sets.push('visibility = ?')
    binds.push(v)
    if (v !== 'held') sets.push('held_reason = NULL')
  }

  // Who wrote it. A pasted document and a pasted conversation land as the
  // log's line, because the log cannot know who wrote them and must not ask
  // at input. This is where he says. It only ever moves toward him — the log
  // never takes authorship back off him.
  if (body.author === 'operator' && existing.author !== 'operator') {
    note('author', existing.author, 'operator')
    sets.push("author = 'operator'")
  }

  // "Wrong split → merge, thread intact." The log split one take into parts
  // it thought were separate; this is where he says two of them were one
  // thing. Both wordings survive: the target gains the words, this row is
  // buried rather than deleted, and the revision record on both says what
  // happened.
  if (typeof body.merge_into === 'string' && body.merge_into && body.merge_into !== id) {
    const target = await findOne<{ id: string; text: string }>(
      db,
      `SELECT id, text FROM log_entries
        WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      body.merge_into, operator.id,
    )
    if (!target) return NextResponse.json({ error: 'no such entry to merge into' }, { status: 400 })

    const joined = `${target.text.trim()} ${existing.text.trim()}`.replace(/\s+/g, ' ').trim()
    await run(
      db,
      // Same reason as a rewritten line: the target's text is now two
      // passages joined, so it is no longer what the transcript says for its
      // span, and a later word fix must not rebuild it back apart.
      `UPDATE log_entries SET text = ?, grounded = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      joined, target.id, operator.id,
    )
    await d1Batch(db, [
      {
        sql: `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value)
              VALUES (?,?,?,'merge',?,?)`,
        binds: [ulid(), operator.id, target.id, target.text, joined],
      },
      {
        sql: `INSERT INTO entry_revisions (id, operator_id, entry_id, field, old_value, new_value)
              VALUES (?,?,?,'merge',?,?)`,
        binds: [ulid(), operator.id, id, existing.text, `merged into ${target.id}`],
      },
    ])
    // Buried, not deleted — the words are now in two places and neither is
    // gone.
    sets.push('buried_at = CURRENT_TIMESTAMP', "visibility = 'private'")
  }

  // Bury / dig up. Burying a public entry also unpublishes it (SPEC §1).
  if (body.buried !== undefined) {
    // Digging up is an event, so it is recorded as one rather than erasing
    // the fact that the entry was ever buried.
    if (body.buried) {
      note('bury', existing.buried_at ? 'buried' : 'on the log', 'buried')
      sets.push('buried_at = CURRENT_TIMESTAMP', "visibility = 'private'")
    } else {
      note('bury', existing.buried_at ? `buried ${existing.buried_at}` : 'on the log', 'dug up')
      sets.push('buried_at = NULL')
    }
  }

  if (!sets.length) return NextResponse.json({ error: 'nothing to change' }, { status: 400 })

  sets.push('updated_at = CURRENT_TIMESTAMP')
  binds.push(id, operator.id)
  await run(db, `UPDATE log_entries SET ${sets.join(', ')} WHERE id = ? AND operator_id = ?`, ...binds)
  if (revisions.length) await d1Batch(db, revisions)

  return NextResponse.json({ ok: true, id, recorded: revisions.length }, { headers: { 'Cache-Control': 'no-store' } })
}
