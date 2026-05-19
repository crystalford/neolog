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
      `SELECT id, topic, take, register, strength,
              transcript_span_start, transcript_span_end, extracted_at,
              key_quotes, abstracted_topic, run_id, validated
         FROM threads
        WHERE vlog_id = ? AND operator_id = ? AND deleted_at IS NULL
        ORDER BY transcript_span_start ASC, extracted_at ASC`,
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
      `SELECT id, start_time, end_time, headline, quote, why_clippable, status,
              run_id, validated
         FROM clip_candidates
        WHERE vlog_id = ? AND operator_id = ?
        ORDER BY start_time ASC, id ASC`,
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
      `SELECT id, element_type, content, register,
              transcript_span_start, transcript_span_end, run_id, validated,
              extracted_at
         FROM creative_elements
        WHERE vlog_id = ? AND operator_id = ?
        ORDER BY element_type ASC, extracted_at DESC`,
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
      `SELECT id, name, entity_type, aliases, mention_count
         FROM entities
        WHERE vlog_id = ? AND operator_id = ?
        ORDER BY mention_count DESC, name ASC`,
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
