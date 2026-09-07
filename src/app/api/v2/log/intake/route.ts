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
import { dispatchPipeline } from '@/lib/dispatch-pipeline'
import { verifyStored, findExistingCopy } from '@/lib/keep'
import { splitNote } from '@/lib/split-note'
import {
  looksLikeConversation, splitTurns, operatorTurns, conversationSentence,
  looksLikeDocument, documentSentence,
} from '@/lib/conversation'
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
  /** SHA-256 of the original, computed before it left the browser. */
  checksum?: string
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
    led_from?: string
    relation?: string
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
  const followUps: {
    id: string; r2_key: string; mime: string; kind: 'audio' | 'image'
    happenedAt: string; precision: string
  }[] = []
  const verifies: { id: string; r2_key: string; checksum: string | null; bytes: number | null }[] = []

  // The turn this came out of, when it is one. A thread is just this
  // column followed in either direction.
  const ledFrom = (body.led_from || '').trim() || null
  // A reflection is not a second event. Only meaningful with a target.
  const relation = ledFrom && body.relation === 'reflects' ? 'reflects' : 'led_from'

  const INSERT = `INSERT INTO log_entries
    (id, operator_id, text, detail, occurred_at, happened_at, logged_at,
     date_precision, kind, visibility, held_reason, author, source_kind,
     batch_id, r2_key, mime, bytes, duration_seconds, link_url,
     original_filename, led_from, relation, checksum, keep_state)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`

  // ── The typed / spoken sentence ─────────────────────────────────────────
  // The operator's own words. Author is always `operator`, and the text is
  // stored exactly as typed — hesitations, fragments, no punctuation, all of
  // it (CLAUDE.md's voice-preservation rule applies to his own entries too).
  // A pasted conversation is kept whole and split. Only HIS turns become
  // entries — the same consent rule audio.html states for a two-voice
  // recording, and doubly right here because an entry carries
  // author='operator' and a model's sentence must never sit behind that.
  const isConversation = !!text && !linkUrl && looksLikeConversation(text)
  const turns = isConversation ? splitTurns(text) : []
  const mine = isConversation ? operatorTurns(turns) : []

  // A long structured paste is very often something he KEPT rather than
  // something he WROTE. The log cannot know which, and must not ask at
  // input — so it does not claim: the line is the log's, the body is kept
  // whole, and he can say it is his in one tap. Under-claiming is the only
  // safe direction, because the alternative puts a model's prose behind his
  // name.
  const isDocument = !isConversation && !!text && !linkUrl && looksLikeDocument(text)

  if (text || linkUrl) {
    const id = ulid()
    entryIds.push(id)
    // SPEC §11: a source with no clock gets a date and no time, marked
    // approximate — never the paste time dressed up as when it happened.
    const happenedAt = statedAt || now
    const precision: DatePrecision = statedAt
      ? statedPrecision
      : (isConversation ? 'approx' : 'exact')
    const sentence = isConversation
      ? conversationSentence(text, turns)
      : isDocument
        ? documentSentence(text)
        : (text || `Kept a link: ${linkUrl}`)
    statements.push({
      sql: INSERT,
      binds: [
        id, operator.id, sentence,
        // The whole conversation is kept, so nothing is lost and the other
        // half is still there to read.
        isConversation || isDocument ? text : null,
        happenedAt, happenedAt, now,
        precision,
        isConversation ? 'read' : isDocument ? 'made' : (linkUrl && !text ? 'read' : 'said'),
        'public', null,
        // The log wrote the conversation's own line; his turns below are his.
        isConversation || isDocument ? 'log' : 'operator',
        isConversation ? 'chat' : isDocument ? 'document' : (linkUrl && !text ? 'link' : 'text'),
        batchId, null, null, null, null, linkUrl, null, ledFrom, relation,
        null, null,
      ],
    })
  }

  // Each of his substantive turns, verbatim, pointing back at the
  // conversation it came out of. Nothing the model said becomes an entry.
  if (isConversation && mine.length) {
    const conversationId = entryIds[0]
    for (const turn of mine.slice(0, 60)) {
      const id = ulid()
      entryIds.push(id)
      statements.push({
        sql: INSERT,
        binds: [
          id, operator.id, turn, null,
          statedAt || now, statedAt || now, now,
          statedAt ? statedPrecision : 'approx',
          'said', 'public', null, 'operator', 'chat',
          batchId, null, null, null, null, null, null,
          conversationId, 'led_from', null, null,
        ],
      })
    }
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
        batchId, null, null, null, null, null, null, null, 'led_from',
        null, null,
      ],
    })
  }

  // A video is a recording, not a file sitting on a row. Registering it as
  // a vlog is what gets it transcoded, thumbnailed, transcribed and
  // extracted — and the feed already reads vlogs, so it appears either way.
  // Before this, dropping a 22-minute video into the composer produced an
  // entry you could not play, search or read.
  const videoIds: string[] = []

  // ── One entry per file, each placed by its own clock ────────────────────
  for (const f of files) {
    const mime = (f.mime || '').toLowerCase()
    const isImage = mime.startsWith('image/')
    const isAudio = mime.startsWith('audio/')
    const isVideo = mime.startsWith('video/')

    if (isVideo) {
      const vlogId = ulid()
      videoIds.push(vlogId)
      const placed = statedAt
        ? { happened_at: statedAt, placed_by: 'client' as const }
        : placeFile({
            clientDate: f.happened_at,
            clientSource: f.date_source,
            filename: f.original_filename,
            arrivedAt: now,
          })
      statements.push({
        sql: `INSERT INTO vlogs
                (id, operator_id, r2_key, original_filename, file_size_bytes,
                 mime_type, recorded_at, recorded_at_source, duration_seconds,
                 pipeline_status)
              VALUES (?,?,?,?,?,?,?,?,?,'uploaded')`,
        binds: [
          vlogId, operator.id, f.r2_key, f.original_filename || null,
          f.bytes ?? null, f.mime || null,
          placed.happened_at,
          // The same four-tier vocabulary `recorded-at.ts` uses, so the
          // vlog's own date pipeline and this one agree about what a date
          // is worth.
          placed.placed_by === 'exif' || placed.placed_by === 'media' ? 'pre_extracted'
            : placed.placed_by === 'filename' ? 'filename'
            : placed.placed_by === 'client' ? 'pre_extracted'
            : 'upload_time_default',
          f.duration_seconds ?? null,
        ],
      })
      continue
    }

    const id = ulid()
    entryIds.push(id)

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
        null, f.original_filename || null, ledFrom, relation,
        // Stored so the log can check what it holds against what was
        // sent. Until it has, the file is 'checking' — never 'kept'.
        f.checksum || null, 'checking',
      ],
    })

    if (isAudio) {
      followUps.push({
        id, r2_key: f.r2_key, mime, kind: 'audio',
        happenedAt: placement.happened_at, precision: placement.date_precision,
      })
    } else if (isImage) {
      followUps.push({
        id, r2_key: f.r2_key, mime, kind: 'image',
        happenedAt: placement.happened_at, precision: placement.date_precision,
      })
    }
    // Everything with a file behind it gets verified, whatever kind it is —
    // that is what makes "clear it" mean something.
    verifies.push({ id, r2_key: f.r2_key, checksum: f.checksum || null, bytes: f.bytes ?? null })
  }

  await d1Batch(db, statements)

  // Kick the post-upload pipeline for anything that is a recording. It runs
  // on its own worker, so this returns immediately.
  for (const vlogId of videoIds) {
    try {
      const dispatched = await dispatchPipeline(env as any, {
        vlog_id: vlogId,
        operator_id: operator.id,
        mode: 'cheap',
      })
      if (!dispatched.ok) {
        await run(
          db,
          `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          dispatched.error || 'dispatch failed', vlogId,
        )
      }
    } catch (err: any) {
      console.warn('[intake] pipeline dispatch failed:', err?.message || err)
    }
  }

  // ── The receipt: one line, one undo ─────────────────────────────────────
  const parts: string[] = []
  const words = text ? text.trim().split(/\s+/).filter(Boolean).length : 0
  if (isConversation) {
    parts.push(`a conversation · ${words.toLocaleString('en-GB')} words`)
    if (mine.length) parts.push(`${mine.length} of your turns`)
  } else if (isDocument) {
    parts.push(`a document · ${words.toLocaleString('en-GB')} words`)
  } else if (words) {
    parts.push(`${words} ${words === 1 ? 'word' : 'words'}`)
  }
  if (files.length) parts.push(`${files.length} ${files.length === 1 ? 'file' : 'files'}`)
  if (videoIds.length) {
    parts.push(`${videoIds.length === 1 ? 'a recording' : `${videoIds.length} recordings`} being read`)
  }
  if (linkUrl && !text) parts.push('a link')
  const when = statedAt
    ? `dated ${new Date(statedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
    : 'today'
  const line = `In. ${parts.join(' and ')} · ${when}`

  // ── After the reply: transcribe, and look at the images ─────────────────
  // Nothing here can change what the operator said. It fills in what the log
  // knows about the files, and it happens with him already gone.
  if (followUps.length) {
    ctx.waitUntil(runFollowUps(env, db, operator.id, followUps))
  }
  if (verifies.length) {
    ctx.waitUntil(runVerifications(env, db, operator.id, verifies))
  }

  return NextResponse.json(
    {
      batch_id: batchId,
      entry_ids: entryIds,
      // A video becomes a `vlogs` row, which carries no batch id — so undo
      // is told about them explicitly rather than silently leaving a
      // recording behind after the operator said to take it back.
      vlog_ids: videoIds,
      receipt: { line, undo: batchId },
    },
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
  operatorId: string,
  items: {
    id: string; r2_key: string; mime: string; kind: 'audio' | 'image'
    happenedAt: string; precision: string
  }[],
) {
  await Promise.all(items.map(async item => {
    const { happenedAt, precision } = item
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
        // Keep the timed segments. Whisper returns them and throwing them
        // away left the transcript as one blob with nothing to point at.
        const segments = (result.segments || [])
          .filter(sg => sg && typeof sg.start === 'number' && (sg.text || '').trim())
          .map(sg => ({ s: Math.round(sg.start * 10) / 10, t: sg.text.trim() }))
        await run(
          db,
          `UPDATE log_entries
              SET text = ?, transcript = ?, transcript_segments = ?,
                  author = 'operator', kind = 'said',
                  duration_seconds = COALESCE(duration_seconds, ?),
                  detail = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          said, said,
          segments.length ? JSON.stringify(segments) : null,
          result.duration_seconds ?? null, item.id,
        )

        // One take usually carries several things. Split it into the parts
        // it actually was — each part a verbatim slice of what he said, none
        // of them written by a model. The recording keeps the whole thing;
        // the parts point back at it.
        try {
          const parts = await splitNote(env, said)
          if (parts.length >= 2) {
            const now2 = new Date().toISOString()
            const stmts = parts.map(part => ({
              sql: `INSERT INTO log_entries
                      (id, operator_id, text, occurred_at, happened_at, logged_at,
                       date_precision, kind, visibility, author, source_kind,
                       led_from, relation, vlog_id)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              binds: [
                ulid(), operatorId, part.text,
                // Each part sits at the moment of the recording it came out
                // of. A finer time would be invented, not known.
                happenedAt, happenedAt, now2,
                precision, 'said', 'public', 'operator', 'voice',
                item.id, 'led_from', null,
              ],
            }))
            for (let i = 0; i < stmts.length; i += 40) {
              await d1Batch(db, stmts.slice(i, i + 40))
            }
            // The take says what it turned into, so the parts are not a
            // surprise and the wrong-split correction has somewhere to start.
            await run(
              db,
              `UPDATE log_entries
                  SET detail = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
              `Split into ${parts.length} things you said in it. The whole take is kept.`,
              item.id,
            )
          }
        } catch (err: any) {
          console.warn('[intake] split failed:', err?.message || err)
          // The note stays whole. A failed split is a missing convenience,
          // never a lost entry.
        }
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
          verdict.saw ? `It looks like ${verdict.saw}.` : (verdict.why || 'It has not been looked at yet.'),
          item.id,
        )
      } else if (verdict.reads) {
        // A picture that is really text — a note, a whiteboard, a receipt, a
        // screenshot. The words become the entry's line, because a photo of
        // a note whose words are not read is a photo of nothing. The
        // transcription is kept verbatim and stays the log's, not his:
        // author is already 'log' on an uploaded file.
        await run(
          db,
          `UPDATE log_entries
              SET visibility = 'public', held_reason = NULL,
                  text = ?, transcript = ?, kind = 'paperwork',
                  detail = COALESCE(detail, ?), updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          firstLine(verdict.reads), verdict.reads, verdict.description, item.id,
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
 * The first line of what a picture reads, as the entry's own sentence. The
 * whole transcription is kept in `transcript`; this is only what the row
 * shows.
 */
function firstLine(reads: string): string {
  const first = reads.split('\n').map(l => l.trim()).find(Boolean) || reads.trim()
  const one = first.replace(/\s+/g, ' ')
  return one.length > 160 ? `${one.slice(0, 158)}…` : one
}

/**
 * Check what was stored against what was sent, and notice exact copies.
 *
 * This is what lets the log say "kept, checked, you can clear this" and mean
 * it. Until it has run, a file's state is `checking`; a check that cannot run
 * leaves it there rather than claiming either answer.
 */
async function runVerifications(
  env: Env,
  db: ReturnType<typeof getDb>,
  operatorId: string,
  items: { id: string; r2_key: string; checksum: string | null; bytes: number | null }[],
) {
  for (const item of items) {
    try {
      const verdict = await verifyStored(env, item.r2_key, {
        checksum: item.checksum, bytes: item.bytes,
      })
      await run(
        db,
        `UPDATE log_entries
            SET keep_state = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        verdict.state, verdict.verified_by, item.id,
      )

      // "The log never deletes a copy." An exact re-arrival attaches to the
      // first one and notes where it came from, so there is one thing with
      // two sources rather than two things.
      if (verdict.state === 'checked' && item.checksum) {
        const original = await findExistingCopy(db, operatorId, item.checksum, item.id)
        if (original) {
          await run(
            db,
            `UPDATE log_entries
                SET copy_of = ?, visibility = 'private',
                    detail = COALESCE(detail, 'Already here — this exact file arrived earlier. Kept as a second source rather than a second entry.'),
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            original.id, item.id,
          )
        }
      }
    } catch (err: any) {
      console.warn(`[intake] verification failed for ${item.id}:`, err?.message || err)
    }
  }
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
  const vlogIds = (url.searchParams.get('vlogs') || '')
    .split(',').map(v => v.trim()).filter(Boolean).slice(0, 50)
  if (!batchId && !entryId && !vlogIds.length) {
    return NextResponse.json({ error: 'batch, entry or vlogs required' }, { status: 400 })
  }

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
  // A recording registered by this act. Soft-deleted the same way, so the
  // file stays in R2 and only the row leaves the log.
  for (const v of vlogIds) {
    await run(
      db,
      `UPDATE vlogs SET deleted_at = CURRENT_TIMESTAMP
        WHERE operator_id = ? AND id = ? AND deleted_at IS NULL`,
      operator.id, v,
    )
  }

  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
