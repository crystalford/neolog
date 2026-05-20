/**
 * GET /api/v2/vlogs/[id]
 *
 * Fetch one vlog with a fresh presigned playback URL. Used by the vlog
 * detail page in Timeline v2.
 *
 * Returns:
 *   {
 *     vlog: { id, ..., transcript_text, key_quotes_count, threads_count },
 *     video_url: presigned R2 URL (transcoded_r2_key if present else r2_key),
 *     threads: [{ id, topic, take, strength, transcript_span_start, ... }],
 *   }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const db = getDb(env)
  const vlog = await findOne<{
    id: string
    operator_id: string
    r2_key: string
    transcoded_r2_key: string | null
    thumbnail_r2_key: string | null
    original_filename: string
    file_size_bytes: number
    mime_type: string
    duration_seconds: number | null
    recorded_at: string | null
    recorded_at_source: string | null
    uploaded_at: string
    thumbnail_url: string | null
    transcript_text: string | null
    transcript_provider: string | null
    summary: string | null
    pipeline_status: string
    pipeline_error: string | null
    extraction_outcomes: string | null
    visibility: string
    created_at: string
    updated_at: string
  }>(
    db,
    `SELECT * FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Presign playback URL — prefer transcoded (H.264, browser-friendly) over original.
  const playbackKey = vlog.transcoded_r2_key || vlog.r2_key
  let videoUrl: string | null = null
  try {
    videoUrl = await presignGetUrl(env, playbackKey, 3600)
  } catch (err: any) {
    console.warn(`[vlogs/[id]] presign failed for ${playbackKey}: ${err?.message}`)
  }

  // Resolve thumbnail — same three-state contract as the list endpoint
  // (src/app/api/v2/vlogs/route.ts): R2 key > legacy data URI > null.
  let thumbnailUrl: string | null = null
  if (vlog.thumbnail_r2_key) {
    try {
      thumbnailUrl = await presignGetUrl(env, vlog.thumbnail_r2_key, 24 * 3600)
    } catch (err: any) {
      console.warn(`[vlogs/[id]] thumbnail presign failed: ${err?.message}`)
    }
  } else if (vlog.thumbnail_url) {
    thumbnailUrl = vlog.thumbnail_url
  }

  // Fetch every kind of extracted artifact. Each query is wrapped so a
  // schema drift on one table (e.g. an old DB where entities.vlog_id
  // hasn't been migrated yet) can't 500 the whole detail page — the
  // missing section just comes back empty.
  const safe = async <T,>(label: string, q: () => Promise<T[]>): Promise<T[]> => {
    try { return await q() } catch (err: any) {
      console.warn(`[vlogs/[id]] ${label} failed: ${err?.message || err}`)
      return []
    }
  }

  // Filter all extraction outputs to the currently-active extraction
  // run for this vlog. Without this, re-extracted vlogs show duplicate
  // threads/clips/creative/entities from both old and new runs (the
  // pipeline marks old extraction_runs.is_active=0 on re-extract but
  // doesn't physically remove the older rows).
  //
  // INNER JOIN with er.is_active=1 means: only return rows whose run_id
  // matches the operator's current active run. Old run rows simply
  // disappear from the API response.
  const [threads, clips, creative_elements, entities] = await Promise.all([
    safe('threads', () => findMany<{
      id: string
      topic: string
      take: string | null
      register: string | null
      strength: number | null
      transcript_span_start: number | null
      transcript_span_end: number | null
      extracted_at: string
      key_quotes: string | null
      abstracted_topic: string | null
      run_id: string | null
      validated: number | null
    }>(
      db,
      `SELECT t.id, t.topic, t.take, t.register, t.strength,
              t.transcript_span_start, t.transcript_span_end, t.extracted_at,
              t.key_quotes, t.abstracted_topic, t.run_id, t.validated
         FROM threads t
         JOIN extraction_runs er ON er.id = t.run_id
        WHERE t.vlog_id = ? AND t.operator_id = ?
          AND t.deleted_at IS NULL
          AND er.is_active = 1
        ORDER BY t.transcript_span_start ASC, t.extracted_at ASC`,
      params.id, operator.id,
    )),
    safe('clips', () => findMany<{
      id: string
      start_time: number | null
      end_time: number | null
      headline: string
      quote: string | null
      why_clippable: string | null
      status: string | null
      run_id: string | null
      validated: number | null
    }>(
      db,
      `SELECT c.id, c.start_time, c.end_time, c.headline, c.quote, c.why_clippable, c.status,
              c.run_id, c.validated
         FROM clip_candidates c
         JOIN extraction_runs er ON er.id = c.run_id
        WHERE c.vlog_id = ? AND c.operator_id = ?
          AND c.deleted_at IS NULL
          AND er.is_active = 1
        ORDER BY c.start_time ASC, c.id ASC`,
      params.id, operator.id,
    )),
    safe('creative_elements', () => findMany<{
      id: string
      element_type: string
      content: string
      register: string | null
      transcript_span_start: number | null
      transcript_span_end: number | null
      run_id: string | null
      validated: number | null
      extracted_at: string
    }>(
      db,
      `SELECT ce.id, ce.element_type, ce.content, ce.register,
              ce.transcript_span_start, ce.transcript_span_end, ce.run_id, ce.validated,
              ce.extracted_at
         FROM creative_elements ce
         JOIN extraction_runs er ON er.id = ce.run_id
        WHERE ce.vlog_id = ? AND ce.operator_id = ?
          AND ce.deleted_at IS NULL
          AND er.is_active = 1
        ORDER BY ce.element_type ASC, ce.extracted_at DESC`,
      params.id, operator.id,
    )),
    safe('entities', () => findMany<{
      id: string
      name: string
      entity_type: string
      aliases: string | null
      mention_count: number | null
    }>(
      db,
      `SELECT e.id, e.name, e.entity_type, e.aliases, e.mention_count
         FROM entities e
         JOIN extraction_runs er ON er.id = e.run_id
        WHERE e.vlog_id = ? AND e.operator_id = ?
          AND e.deleted_at IS NULL
          AND er.is_active = 1
        ORDER BY e.mention_count DESC, e.name ASC`,
      params.id, operator.id,
    )),
  ])

  // Strip internal R2 keys before sending to the client.
  const {
    r2_key: _r2,
    transcoded_r2_key: _tr2,
    thumbnail_r2_key: _thumbr2,
    ...safeVlog
  } = vlog
  return NextResponse.json({
    vlog: { ...safeVlog, thumbnail_url: thumbnailUrl, playback_url: videoUrl },
    video_url: videoUrl,
    threads,
    clips,
    creative_elements,
    entities,
  })
}

/**
 * DELETE /api/v2/vlogs/[id]
 *
 * Soft-deletes the vlog row (sets deleted_at) AND removes the underlying
 * R2 objects (original, transcoded, thumbnail). All derived rows that
 * reference the vlog (threads, clips, creative_elements, entity_mentions,
 * extraction_runs, pipeline_events, transcript_words) are removed by
 * ON DELETE CASCADE on the foreign keys.
 *
 * Soft-delete on the vlog row preserves the ID so any cross-references
 * left dangling fail loudly instead of returning silent nulls. The R2
 * bytes are gone — only the recorded_at + filename remain in the DB.
 *
 * Best-effort: if R2 deletes fail (transient network), the DB row is
 * still soft-deleted and we return ok; orphan R2 bytes can be cleaned
 * later. This matches the operator's expectation that "delete should
 * not leave a vlog visible just because R2 had a hiccup."
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const { id: vlog_id } = params
  if (!vlog_id) return NextResponse.json({ error: 'vlog id required' }, { status: 400 })

  const db = getDb(env)
  const row = await findOne<{
    id: string
    r2_key: string | null
    transcoded_r2_key: string | null
    thumbnail_r2_key: string | null
  }>(
    db,
    `SELECT id, r2_key, transcoded_r2_key, thumbnail_r2_key
       FROM vlogs
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    vlog_id, operator.id,
  )
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Best-effort R2 deletes (we still soft-delete the row even if any fail).
  const r2Errors: string[] = []
  const { deleteObject } = await import('@/lib/r2')
  for (const key of [row.r2_key, row.transcoded_r2_key, row.thumbnail_r2_key]) {
    if (!key) continue
    try { await deleteObject(env, key) }
    catch (e: any) { r2Errors.push(`${key}: ${e?.message || String(e)}`) }
  }

  // Soft-delete the vlog row. CASCADE handles the derived tables.
  await db.prepare(
    `UPDATE vlogs SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
  ).bind(vlog_id, operator.id).run()

  return NextResponse.json({
    ok: true,
    vlog_id,
    r2_errors: r2Errors.length ? r2Errors : undefined,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
