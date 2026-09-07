/**
 * POST /api/v2/log/intake — the way in.
 *
 * Everything the operator puts in comes through here: a typed sentence, a
 * voice note, a dropped file, a pasted link, a pasted conversation. The reply
 * is the receipt — one line saying what happened, and one undo.
 *
 * Body:
 *   {
 *     text?: string,                       // typed, or the caption on files
 *     happened_at?: string,                // an explicit backdate
 *     date_precision?: DatePrecision,      // 'year' for "sometime in 2008"
 *     link_url?: string,
 *     files?: [{ r2_key, original_filename?, mime?, bytes?,
 *                happened_at?, date_source?, duration_seconds? }]
 *   }
 *
 * Reply: { batch_id, entry_ids, receipt: { line, undo } }
 *
 * ── The rules this endpoint exists to keep ────────────────────────────────
 *
 * SPEC §0 rule 6, "Never ask at input": this endpoint has no required field
 * beyond having *something* to put in, returns immediately, and asks nothing.
 * The slow work — transcribing a voice note, looking at an image to decide
 * whether it must be held back — runs after the reply, in `waitUntil`.
 *
 * SPEC §1, "two times on every entry": `logged_at` is now, always.
 * `happened_at` is the operator's backdate if he gave one, the file's own
 * clock if it has one, and the arrival time marked `approx` if neither.
 *
 * SPEC §1, "every act of putting something in is itself an entry, with a
 * manifest": more than one file in one go creates a batch entry dated
 * `logged_at`, and each file becomes its own entry placed by its own clock
 * and carrying the batch id. Fifty photos at 14:02 = one act + fifty entries.
 *
 * SPEC §0.2, "being wrong towards private is the only safe direction":
 * uploaded images land `held` and are released only once the check has
 * looked at them and said they are ordinary. A check that cannot run leaves
 * the entry held.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, run, batch as d1Batch } from '@/lib/d1'
import { getObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import { transcribeAudio } from '@/lib/transcribe'
import { checkHoldBack, placeFile, kindForUpload } from '@/lib/log-intake'
import { batchSentence, spokenDuration, type DatePrecision } from '@/lib/log-entry'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  // The real Workers AI binding type — `transcribeAudio` needs the full
  // shape, and it satisfies the looser one `checkHoldBack` asks for.
  AI: Ai
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

interface IncomingFile {
  r2_key: string
  original_filename?: string
  mime?: string
  bytes?: number
  happened_at?: string
  date_source?: string
  duration_seconds?: number
}

const PRECISIONS = new Set<DatePrecision>(['exact', 'day', 'month', 'year', 'approx'])

/** The sentence for a file, composed from the file's own facts. */
function sentenceForFile(f: IncomingFile): string {
  const m = (f.mime || '').toLowerCase()
  if (m.startsWith('image/')) return 'Took a photo.'
  if (m.startsWith('video/')) {
    const d = spokenDuration(f.duration_seconds ?? null)
    return d ? `Recorded ${d} of video.` : 'Recorded a video.'
  }
  if (m.startsWith('audio/')) {
    const d = spokenDuration(f.duration_seconds ?? null)
    return d ? `Talked for ${d}.` : 'Recorded a voice note.'
  }
  const name = f.original_filename
  return name ? `Kept a file: ${name}` : 'Kept a file.'
}

export async function POST(req: NextRequest) {
  const { env: rawEnv, ctx } = getRequestContext()
  const env = rawEnv as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const body = await req.json().catch(() => ({})) as {
    text?: string
    happened_at?: string
    date_precision?: string
    link_url?: string
    files?: IncomingFile[]
  }

  const text = (body.text || '').trim()
  const linkUrl = (body.link_url || '').trim() || null
  const files = Array.isArray(body.files) ? body.files.filter(f => f && typeof f.r2_key === 'string') : []

  if (!text && !linkUrl && files.length === 0) {
    return NextResponse.json({ error: 'nothing to put in' }, { status: 400 })
  }
  if (text.length > 100_000) {
    return NextResponse.json({ error: 'text too long' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // The operator's explicit backdate, if he gave one. This is the ONE place
  // a date can come from the operator rather than from a file.
  let statedAt: string | null = null
  let statedPrecision: DatePrecision = 'exact'
  if (body.happened_at) {
    const d = new Date(body.happened_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'happened_at is not a valid date' }, { status: 400 })
    statedAt = d.toISOString()
    const p = body.date_precision as DatePrecision
    statedPrecision = PRECISIONS.has(p) ? p : 'day'
  }

  const batchId = ulid()
  const statements: { sql: string; binds: unknown[] }[] = []
  const entryIds: string[] = []
  // Files needing work after the reply: transcription, or the hold-back look.
  const followUps: { id: string; r2_key: string; mime: string; kind: 'audio' | 'image' }[] = []

  const INSERT = `INSERT INTO log_entries
    (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
     date_precision, kind, visibility, held_reason, author, source_kind,
     batch_id, r2_key, mime, bytes, duration_seconds, link_url, original_filename)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

  // ── The typed / spoken sentence ─────────────────────────────────────────
  // The operator's own words. Author is always `operator`, and the text is
  // stored exactly as typed — hesitations, fragments, no punctuation, all of
  // it (CLAUDE.md's voice-preservation rule applies to his own entries too).
  if (text || linkUrl) {
    const id = ulid()
    entryIds.push(id)
    const happenedAt = statedAt || now
    const precision = statedAt ? statedPrecision : 'exact'
    const sentence = text || `Kept a link: ${linkUrl}`
    statements.push({
      sql: INSERT,
      binds: [
        id, operator.id, sentence, null, happenedAt, happenedAt, now,
        precision, linkUrl && !text ? 'read' : 'said', 'public', null, 'operator',
        linkUrl && !text ? 'link' : 'text',
        batchId, null, null, null, null, linkUrl, null,
      ],
    })
  }

  // ── The act of putting files in — itself an entry, with the manifest ────
  if (files.length > 1) {
    const id = ulid()
    entryIds.push(id)
    const names = files.map(f => f.original_filename || 'a file')
    statements.push({
      sql: INSERT,
      binds: [
        id, operator.id, batchSentence(files.length),
        names.slice(0, 12).join(', ') + (names.length > 12 ? `, and ${names.length - 12} more` : ''),
        now, now, now, 'exact', 'happened', 'public', null, 'log', 'batch',
        batchId, null, null, null, null, null, null,
      ],
    })
  }

  // ── One entry per file, each placed by its own clock ────────────────────
  for (const f of files) {
    const id = ulid()
    entryIds.push(id)
    const mime = (f.mime || '').toLowerCase()
    const isImage = mime.startsWith('image/')
    const isAudio = mime.startsWith('audio/')

    // An explicit backdate on the whole intake wins over the file's clock —
    // the operator saying "this was 2008" is better evidence than a camera
    // whose battery died. Otherwise the file's own clock places it.
    const placement = statedAt
      ? { happened_at: statedAt, date_precision: statedPrecision, placed_by: 'client' as const }
      : placeFile({
          clientDate: f.happened_at,
          clientSource: f.date_source,
          filename: f.original_filename,
          arrivedAt: now,
        })

    // Images arrive held; the check releases them. Everything else is public
    // by default, which is the rule for what the operator writes.
    const held = isImage
    statements.push({
      sql: INSERT,
      binds: [
        id, operator.id, sentenceForFile(f),
        // What the log knows about the file, said plainly. When it had to
        // guess the date it says so here, so the correction is one tap away.
        placement.placed_by === 'arrival'
          ? 'No date on this file, so it sits at the time it arrived.'
          : placement.placed_by === 'filename'
            ? 'Dated from the filename.'
            : null,
        placement.happened_at, placement.happened_at, now,
        placement.date_precision,
        kindForUpload(mime, false),
        held ? 'held' : 'public',
        held ? 'not looked at yet' : null,
        'log',
        isAudio ? 'voice' : 'file',
        batchId,
        f.r2_key, f.mime || null, f.bytes ?? null, f.duration_seconds ?? null,
        null, f.original_filename || null,
      ],
    })

    if (isAudio) followUps.push({ id, r2_key: f.r2_key, mime, kind: 'audio' })
    else if (isImage) followUps.push({ id, r2_key: f.r2_key, mime, kind: 'image' })
  }

  await d1Batch(db, statements)

  // ── The receipt: one line, one undo ─────────────────────────────────────
  const parts: string[] = []
  const words = text ? text.trim().split(/\s+/).filter(Boolean).length : 0
  if (words) parts.push(`${words} ${words === 1 ? 'word' : 'words'}`)
  if (files.length) parts.push(`${files.length} ${files.length === 1 ? 'file' : 'files'}`)
  if (linkUrl && !text) parts.push('a link')
  const when = statedAt
    ? `dated ${new Date(statedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : 'today'
  const line = `In. ${parts.join(' and ')} · ${when}`

  // ── After the reply: transcribe, and look at the images ─────────────────
  // Nothing here can change what the operator said. It fills in what the log
  // knows about the files, and it happens with him already gone.
  if (followUps.length) {
    ctx.waitUntil(runFollowUps(env, db, followUps))
  }

  return NextResponse.json(
    { batch_id: batchId, entry_ids: entryIds, receipt: { line, undo: batchId } },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * The work that happens after the operator has gone. Each item is independent
 * — one failure never takes the others down, and a failure always leaves the
 * entry in its safe state rather than reverting it to public.
 */
async function runFollowUps(
  env: Env,
  db: ReturnType<typeof getDb>,
  items: { id: string; r2_key: string; mime: string; kind: 'audio' | 'image' }[],
) {
  await Promise.all(items.map(async item => {
    try {
      if (item.kind === 'audio') {
        // Only the transcription path needs the bytes in the Function. The
        // hold-back check reads its own object, and caps the size.
        const obj = await getObject(env, item.r2_key)
        if (!obj) return
        const bytes = new Uint8Array(await obj.arrayBuffer())
        // Whisper on Workers AI. The words are the operator's, so the entry
        // becomes his sentence and the author flips to `operator` — the log
        // transcribed it, it did not write it.
        const result = await transcribeAudio(env, bytes)
        const said = (result.text || '').trim()
        if (!said) return
        await run(
          db,
          `UPDATE log_entries
              SET text = ?, transcript = ?, author = 'operator', kind = 'said',
                  duration_seconds = COALESCE(duration_seconds, ?),
                  detail = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          said, said, result.duration_seconds ?? null, item.id,
        )
        return
      }

      // An image: look at it once, decide whether it stays held, and keep
      // the description so the row says what the picture is rather than
      // just "Took a photo." The description is the log's, and `author`
      // already records that.
      const verdict = await checkHoldBack(env, item.r2_key, item.mime || 'image/jpeg')
      if (verdict.held) {
        await run(
          db,
          `UPDATE log_entries
              SET visibility = 'held', held_reason = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          verdict.saw, item.id,
        )
      } else {
        await run(
          db,
          `UPDATE log_entries
              SET visibility = 'public', held_reason = NULL,
                  detail = COALESCE(detail, ?), updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          verdict.description, item.id,
        )
      }
    } catch (err: any) {
      console.warn(`[intake] follow-up failed for ${item.id}:`, err?.message || err)
      // Left in its arrival state: an image stays held, audio keeps its
      // placeholder sentence. Both are correctable in one tap.
    }
  }))
}

/**
 * DELETE /api/v2/log/intake?batch=<id> — the receipt's undo.
 *
 * This is the only removal in the product, and it is deliberately not
 * "bury". Burial is a state for something that belongs in the log but should
 * not be on the feed; undo is for something that should never have gone in
 * — a misfire, a wrong window, a paste into the wrong box. It is available
 * for as long as the receipt is on screen and it takes the whole act with it.
 */
export async function DELETE(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const url = new URL(req.url)
  const batchId = url.searchParams.get('batch')
  const entryId = url.searchParams.get('entry')
  if (!batchId && !entryId) return NextResponse.json({ error: 'batch or entry required' }, { status: 400 })

  if (batchId) {
    await run(
      db,
      `UPDATE log_entries SET deleted_at = CURRENT_TIMESTAMP
        WHERE operator_id = ? AND batch_id = ? AND deleted_at IS NULL`,
      operator.id, batchId,
    )
  }
  if (entryId) {
    await run(
      db,
      `UPDATE log_entries SET deleted_at = CURRENT_TIMESTAMP
        WHERE operator_id = ? AND id = ? AND deleted_at IS NULL`,
      operator.id, entryId,
    )
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
