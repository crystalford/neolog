/**
 * GET /api/v2/vlogs/[id] — one recording, whole.
 *
 * `vlog.html`: "one recording in full: the whole video (kept untouched), the
 * word-timestamped transcript, provenance (date from the MP4 `mvhd`, Whisper
 * transcription)."
 *
 * This route used to return `threads`, `clips`, `creative_elements`,
 * `entities`, an anchor take and a session digest — the extraction engine's
 * whole output, none of which the operator trusted. All of it is gone. What
 * a recording has now is: the file, when it happened and how the log knows,
 * the words with their timings, and the entries the log read out of it.
 *
 * Provenance is not decoration here. `recorded_at_source` says which of the
 * four tiers dated it, and `transcript_provider` says who wrote the words
 * down. Both travel to the page so the recording can be checked rather than
 * believed.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { readyDb } from '@/lib/ready-db'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

/** In words, how the log came to believe this recording's date. */
const DATE_SOURCE: Record<string, string> = {
  pre_extracted: 'read out of the filename before it uploaded',
  mvhd: "from the file's own clock",
  filename: 'from the filename',
  upload_time_default: 'the time it uploaded — the file carried no clock',
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'vlog')

  const vlog = await findOne<{
    id: string; title: string | null; original_filename: string | null
    r2_key: string | null; transcoded_r2_key: string | null
    thumbnail_r2_key: string | null; thumbnail_url: string | null
    duration_seconds: number | null; file_size_bytes: number | null
    mime_type: string | null
    recorded_at: string | null; recorded_at_source: string | null; created_at: string
    transcript_text: string | null; transcript_provider: string | null
    transcript_completed_at: string | null
    pipeline_status: string | null; extraction_outcomes: string | null
    read_at: string | null
    vision_description: string | null; frame_note: string | null
    usable: number | null
  }>(
    db,
    `SELECT id, title, original_filename, r2_key, transcoded_r2_key,
            thumbnail_r2_key, thumbnail_url, duration_seconds, file_size_bytes,
            mime_type, recorded_at, recorded_at_source, created_at,
            transcript_text, transcript_provider, transcript_completed_at,
            pipeline_status, extraction_outcomes, read_at,
            vision_description, frame_note, usable
       FROM vlogs
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [words, entries, nav] = await Promise.all([
    // The transcript as it was heard, with the second on every word. This is
    // the primary material; everything on the log from this recording is a
    // contiguous run of it.
    findMany<{ word: string; start_time: number; end_time: number; word_index: number }>(
      db,
      `SELECT word, start_time, end_time, word_index
         FROM transcript_words
        WHERE vlog_id = ? AND operator_id = ?
        ORDER BY word_index ASC LIMIT 20000`,
      params.id, operator.id,
    ),
    // What the log read out of it. Each one links back to its own second.
    findMany<{
      id: string; text: string; happened_at: string
      span_start: number | null; span_end: number | null
    }>(
      db,
      `SELECT id, text, COALESCE(happened_at, occurred_at, created_at) AS happened_at,
              span_start, span_end
         FROM log_entries
        WHERE vlog_id = ? AND operator_id = ? AND deleted_at IS NULL AND buried_at IS NULL
        ORDER BY COALESCE(span_start, 0) ASC LIMIT 500`,
      params.id, operator.id,
    ),
    findOne<{ prev_id: string | null; next_id: string | null }>(
      db,
      `SELECT
         (SELECT id FROM vlogs WHERE operator_id = ?1 AND deleted_at IS NULL
            AND COALESCE(recorded_at, created_at) < COALESCE(?2, ?3)
          ORDER BY COALESCE(recorded_at, created_at) DESC LIMIT 1) AS prev_id,
         (SELECT id FROM vlogs WHERE operator_id = ?1 AND deleted_at IS NULL
            AND COALESCE(recorded_at, created_at) > COALESCE(?2, ?3)
          ORDER BY COALESCE(recorded_at, created_at) ASC LIMIT 1) AS next_id`,
      operator.id, vlog.recorded_at, vlog.created_at,
    ),
  ])

  // Only what is actually shown gets signed.
  const [playUrl, posterUrl] = await Promise.all([
    (async () => {
      const key = vlog.transcoded_r2_key || vlog.r2_key
      if (!key) return null
      try { return await presignGetUrl(env, key, 6 * 3600) } catch { return null }
    })(),
    (async () => {
      if (!vlog.thumbnail_r2_key) return vlog.thumbnail_url || null
      try { return await presignGetUrl(env, vlog.thumbnail_r2_key, 24 * 3600) } catch { return vlog.thumbnail_url || null }
    })(),
  ])

  return NextResponse.json(
    {
      vlog: {
        ...vlog,
        play_url: playUrl,
        poster_url: posterUrl,
        // Said plainly, not as a column value the page has to decode.
        date_from: DATE_SOURCE[(vlog.recorded_at_source || '').toLowerCase()] || 'unknown',
        transcribed_by: vlog.transcript_provider === 'workers_ai_whisper' ? 'Whisper' : vlog.transcript_provider,
        word_count: words.length,
      },
      words,
      entries,
      navigation: nav || { prev_id: null, next_id: null },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * DELETE /api/v2/vlogs/[id] — bury a recording. The file stays.
 *
 * The handler this replaces deleted the R2 objects along with the row. That
 * is the one thing this product must never do: the recordings in R2 are the
 * only data preserved across every rebuild, and by 8 Sep they are the only
 * data preserved at all. A hand slipping on this button used to be
 * unrecoverable.
 *
 * So it buries. SPEC §1: "There is no delete action. Bury removes an entry
 * from the feed, search and counts and keeps the file, the attachments and
 * the relationships." The entries the log read out of the recording are
 * buried with it — they are its words, and leaving them on the feed pointing
 * at a recording that is gone from it would be a worse state than either.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = await readyDb(getDb(env), 'vlog')

  const row = await findOne<{ id: string }>(
    db,
    `SELECT id FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { run } = await import('@/lib/d1')
  await run(
    db,
    `UPDATE vlogs SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    params.id, operator.id,
  )
  const buried: any = await run(
    db,
    `UPDATE log_entries SET buried_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE vlog_id = ? AND operator_id = ? AND buried_at IS NULL`,
    params.id, operator.id,
  )

  return NextResponse.json(
    {
      ok: true,
      vlog_id: params.id,
      entries_buried: buried?.meta?.changes ?? 0,
      // Said out loud, because the button used to mean the opposite.
      file_kept: true,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
