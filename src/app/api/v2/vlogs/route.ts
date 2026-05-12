/**
 * /api/v2/vlogs
 *
 * POST   — register a vlog row in D1 after the R2 upload completes. The
 *          browser includes the client-captured thumbnail (data URI) and the
 *          recorded_at it inferred from the filename. Server-side will fill
 *          in mvhd-derived recorded_at and verify the thumbnail later in
 *          the post-upload Workflow.
 *
 * GET    — list operator's vlogs. Query params:
 *            status   — comma-separated filter (e.g. 'archived,uploaded')
 *            limit    — default 200, max 500
 *            offset   — default 0
 *          Returns { vlogs: [...] } sorted by recorded_at desc, created_at desc.
 *
 * DELETE — delete a vlog by id (query param ?id=...). Removes the D1 row,
 *          cascading transcript_words / threads / etc via FK constraints,
 *          and best-effort deletes the R2 objects (original + transcoded).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findMany, findOne, run } from '@/lib/d1'
import { deleteObject, presignGetUrl, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  // Service binding to the neolog-process-upload Worker (see process route for
  // why we don't use a direct workflow binding from Pages).
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

// ─── POST: register a vlog after the upload completes ───────────────────────

export async function POST(req: NextRequest) {
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

  const body = await req.json().catch(() => null) as
    | {
        r2_key?: string
        original_filename?: string
        file_size_bytes?: number
        mime_type?: string
        recorded_at?: string | null
        thumbnail_url?: string | null
        archive?: boolean
      }
    | null

  if (!body || !body.r2_key || !body.original_filename || !body.file_size_bytes || !body.mime_type) {
    return NextResponse.json(
      { error: 'r2_key, original_filename, file_size_bytes, mime_type required' },
      { status: 400 },
    )
  }

  // Verify the R2 key belongs to this operator (prefix check)
  if (!body.r2_key.startsWith(`${operator.id}/`)) {
    return NextResponse.json({ error: 'Forbidden — key does not belong to operator' }, { status: 403 })
  }

  const db = getDb(env)

  // Duplicate detection: same filename + same size, recent
  const dup = await findOne<{ id: string; pipeline_status: string }>(
    db,
    `SELECT id, pipeline_status FROM vlogs
     WHERE operator_id = ? AND original_filename = ? AND file_size_bytes = ?
       AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    operator.id, body.original_filename, body.file_size_bytes,
  )
  if (dup) {
    return NextResponse.json(
      { duplicate: true, existing_id: dup.id, existing_status: dup.pipeline_status },
      { status: 409 },
    )
  }

  const id = ulid()
  const pipelineStatus = body.archive ? 'archived' : 'uploaded'
  const recordedAtSource = body.recorded_at ? 'pre_extracted' : null

  await run(
    db,
    `INSERT INTO vlogs (
       id, operator_id, r2_key, original_filename, file_size_bytes, mime_type,
       recorded_at, recorded_at_source, thumbnail_url, pipeline_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, operator.id, body.r2_key, body.original_filename, body.file_size_bytes, body.mime_type,
    body.recorded_at ?? null, recordedAtSource, body.thumbnail_url ?? null, pipelineStatus,
  )

  // Trigger the post-upload Workflow when not in archive mode.
  // Archive uploads stay in 'archived' status until the operator hits
  // "Process now" on the vlog detail page (which calls /api/v2/vlogs/[id]/process).
  if (!body.archive && env.PROCESS_UPLOAD) {
    try {
      const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_id: id, operator_id: operator.id }),
      })
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`dispatch failed (${res.status}): ${err.slice(0, 500)}`)
      }
    } catch (err: any) {
      // Surface the dispatch failure on the row but don't fail the create —
      // the operator can retry via /api/v2/vlogs/[id]/process.
      await run(
        db,
        `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        `Workflow dispatch failed: ${err.message}`,
        id,
      )
    }
  }

  return NextResponse.json({ id, pipeline_status: pipelineStatus }, { status: 201 })
}

// ─── GET: list vlogs ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status')
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500)
  const offset = parseInt(searchParams.get('offset') || '0', 10)

  let sql = `
    SELECT id, original_filename, file_size_bytes, mime_type, duration_seconds,
           recorded_at, recorded_at_source, uploaded_at, thumbnail_url, r2_key,
           transcoded_r2_key,
           pipeline_status, pipeline_error, visibility, transcript_text IS NOT NULL AS has_transcript,
           created_at, updated_at
    FROM vlogs
    WHERE operator_id = ? AND deleted_at IS NULL
  `
  const binds: unknown[] = [operator.id]

  if (statusFilter) {
    const statuses = statusFilter.split(',').map(s => s.trim()).filter(Boolean)
    if (statuses.length > 0) {
      sql += ` AND pipeline_status IN (${statuses.map(() => '?').join(',')})`
      binds.push(...statuses)
    }
  }

  sql += ` ORDER BY recorded_at DESC, created_at DESC LIMIT ? OFFSET ?`
  binds.push(limit, offset)

  const db = getDb(env)
  const rows = await findMany<{
    id: string
    original_filename: string
    file_size_bytes: number
    mime_type: string
    duration_seconds: number | null
    recorded_at: string | null
    recorded_at_source: string | null
    uploaded_at: string
    thumbnail_url: string | null
    r2_key: string
    transcoded_r2_key: string | null
    pipeline_status: string
    pipeline_error: string | null
    visibility: string
    has_transcript: number
    created_at: string
    updated_at: string
  }>(db, sql, ...binds)

  // Sign short-lived (1 hr) playback URLs for tiles. Browser uses the
  // first frame of the video as the visible poster via <video preload="metadata">.
  // Presigning is CPU-only (HMAC), no I/O, so doing N of them is cheap.
  // Skip vlogs that already have a thumbnail_url (data: URI) to save bytes.
  const vlogsWithUrls = await Promise.all(
    rows.map(async r => {
      let playback_url: string | null = null
      if (!r.thumbnail_url) {
        const playbackKey = r.transcoded_r2_key || r.r2_key
        try {
          playback_url = await presignGetUrl(env, playbackKey, 3600)
        } catch {
          // presigning needs R2_ACCESS_KEY_ID/SECRET — leave null if absent
        }
      }
      // Don't ship r2_key or transcoded_r2_key to client (internal-only)
      const { r2_key: _omit1, transcoded_r2_key: _omit2, ...safe } = r
      return { ...safe, playback_url }
    }),
  )

  return NextResponse.json({ vlogs: vlogsWithUrls, limit, offset })
}

// ─── DELETE: remove a vlog ──────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
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

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getDb(env)
  const vlog = await findOne<{ id: string; r2_key: string; transcoded_r2_key: string | null }>(
    db,
    'SELECT id, r2_key, transcoded_r2_key FROM vlogs WHERE id = ? AND operator_id = ?',
    id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cascade-delete dependent rows via FK ON DELETE CASCADE
  await run(db, 'DELETE FROM vlogs WHERE id = ? AND operator_id = ?', id, operator.id)

  // Best-effort R2 cleanup (don't fail the delete if R2 cleanup fails)
  const keysToDelete = [vlog.r2_key, vlog.transcoded_r2_key].filter(Boolean) as string[]
  await Promise.all(keysToDelete.map(k => deleteObject(env, k).catch(() => null)))

  return NextResponse.json({ ok: true })
}
