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
import { deleteObject, presignGetUrl, putObject, type R2Env } from '@/lib/r2'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { deriveRecordedAt } from '@/lib/recorded-at'
import { ulid } from '@/lib/ulid'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  // Service binding to the neolog-process-upload Worker (see process route for
  // why we don't use a direct workflow binding from Pages).
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  PIPELINE?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  HEARTBEAT_TOKEN?: string
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
        thumbnail_blob_base64?: string | null  // browser-captured JPEG, written to R2 inline
        audio_chunks_json?: Array<{ r2_key: string; start_sec: number; end_sec: number; bytes: number }> | null
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

  // Backdate at the API edge — runs the locked 4-tier fallback synchronously
  // before workflow dispatch, so a downstream workflow failure can never cost
  // us the recorded_at. The workflow keeps its own extract-recorded-at step as
  // a safety net for archived imports / cases where the API tiers all miss.
  const derived = await deriveRecordedAt({
    clientRecordedAt: body.recorded_at ?? null,
    filename: body.original_filename,
    r2Key: body.r2_key,
    env,
  })

  // Browser-captured thumbnail rides along inline. Decode the base64 and
  // write to R2 at the standard thumb key. Fail open — if the decode is
  // garbage or the R2 put errors, the workflow's thumbnail step takes over.
  let thumbnailR2Key: string | null = null
  if (body.thumbnail_blob_base64 && typeof body.thumbnail_blob_base64 === 'string') {
    try {
      const bin = base64ToBytes(body.thumbnail_blob_base64)
      if (bin.byteLength >= 1024) {
        const key = `${operator.id}/thumbs/${id}.jpg`
        await putObject(env, key, bin, { httpMetadata: { contentType: 'image/jpeg' } })
        thumbnailR2Key = key
      }
    } catch {
      // ignore — workflow fallback handles it
    }
  }

  // Validate browser-extracted audio chunks if supplied. All chunk r2_keys
  // must share the prefix of the source video key so we never accept a
  // pointer to someone else's R2 object.
  let audioChunksJson: string | null = null
  if (Array.isArray(body.audio_chunks_json) && body.audio_chunks_json.length > 0) {
    const expectedPrefix = body.r2_key.split('/').slice(0, 3).join('/') // operator/uploads/ulid
    const ok = body.audio_chunks_json.every(c =>
      typeof c?.r2_key === 'string' &&
      c.r2_key.startsWith(`${expectedPrefix}/audio/`) &&
      typeof c.start_sec === 'number' &&
      typeof c.end_sec === 'number' &&
      typeof c.bytes === 'number',
    )
    if (ok) {
      audioChunksJson = JSON.stringify(body.audio_chunks_json)
    }
  }

  await run(
    db,
    `INSERT INTO vlogs (
       id, operator_id, r2_key, original_filename, file_size_bytes, mime_type,
       recorded_at, recorded_at_source, thumbnail_url, thumbnail_r2_key, pipeline_status,
       audio_chunks_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, operator.id, body.r2_key, body.original_filename, body.file_size_bytes, body.mime_type,
    derived.recorded_at, derived.recorded_at_source, body.thumbnail_url ?? null, thumbnailR2Key, pipelineStatus,
    audioChunksJson,
  )

  // Trigger the post-upload Workflow when not in archive mode.
  // Archive uploads stay in 'archived' status until the operator hits
  // "Process now" on the vlog detail page (which calls /api/v2/vlogs/[id]/process).
  if (!body.archive) {
    // Prefer the new DO orchestrator (neolog-pipeline). It runs the 3-step
    // pipeline (audio_extract → transcribe → extract) with alarm-driven
    // retries, skip-if-exists guards, and live WebSocket progress.
    //
    // Falls back to the legacy 13-step Workflow worker (neolog-process-upload)
    // if the PIPELINE binding isn't present — keeps existing deploys working
    // while the new wiring rolls out.
    const dispatched = await dispatchPipeline(env, id, operator.id)
    if (!dispatched.ok) {
      await run(
        db,
        `UPDATE vlogs SET pipeline_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        dispatched.error,
        id,
      )
    }
  }

  return NextResponse.json({ id, pipeline_status: pipelineStatus }, { status: 201 })
}

async function dispatchPipeline(
  env: Env,
  vlog_id: string,
  operator_id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (env.PIPELINE && env.HEARTBEAT_TOKEN) {
    try {
      const res = await env.PIPELINE.fetch(`https://internal/start/${vlog_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Heartbeat-Token': env.HEARTBEAT_TOKEN,
        },
        body: JSON.stringify({ operator_id, mode: 'auto' }),
      })
      if (res.ok) return { ok: true }
      const txt = await res.text()
      return { ok: false, error: `pipeline /start failed (${res.status}): ${txt.slice(0, 400)}` }
    } catch (err: any) {
      return { ok: false, error: `pipeline /start threw: ${err?.message || err}` }
    }
  }
  // Legacy fallback: PROCESS_UPLOAD workflow
  if (!env.PROCESS_UPLOAD) {
    return { ok: false, error: 'Neither PIPELINE nor PROCESS_UPLOAD service binding is wired on this Pages project — re-run bootstrap.' }
  }
  try {
    const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vlog_id, operator_id }),
    })
    if (res.ok) return { ok: true }
    const txt = await res.text()
    return { ok: false, error: `workflow dispatch failed (${res.status}): ${txt.slice(0, 400)}` }
  } catch (err: any) {
    return { ok: false, error: `workflow dispatch threw: ${err?.message || err}` }
  }
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
    SELECT id, title, original_filename, file_size_bytes, mime_type, duration_seconds,
           recorded_at, recorded_at_source, uploaded_at, thumbnail_url, thumbnail_r2_key,
           r2_key, transcoded_r2_key,
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
    title: string | null
    original_filename: string
    file_size_bytes: number
    mime_type: string
    duration_seconds: number | null
    recorded_at: string | null
    recorded_at_source: string | null
    uploaded_at: string
    thumbnail_url: string | null
    thumbnail_r2_key: string | null
    r2_key: string
    transcoded_r2_key: string | null
    pipeline_status: string
    pipeline_error: string | null
    visibility: string
    has_transcript: number
    created_at: string
    updated_at: string
  }>(db, sql, ...binds)

  // Resolve thumbnail URLs. Three possible states per row:
  //   - r.thumbnail_url is a "data:image/jpeg;base64,..." URI (legacy from
  //     the old data-URI workflow). Return as-is.
  //   - r.thumbnail_r2_key is set (new workflow path). Presign 24-hour R2
  //     GET URL. Browser caches the JPEG via HTTP cache for the TTL.
  //   - Neither is set. Return null; tile shows "no preview" placeholder.
  // Presigning is CPU-only (HMAC), no I/O, so doing N of them is cheap.
  const vlogsWithUrls = await Promise.all(
    rows.map(async r => {
      let thumbnail_url: string | null = null
      if (r.thumbnail_url) {
        // Legacy data URI — preserved verbatim
        thumbnail_url = r.thumbnail_url
      } else if (r.thumbnail_r2_key) {
        try {
          thumbnail_url = await presignGetUrl(env, r.thumbnail_r2_key, 24 * 3600)
        } catch {
          // presigning needs R2_ACCESS_KEY_ID/SECRET — leave null if absent
        }
      }
      // Strip internal R2 keys from client response, but expose a boolean
      // so the gallery card can render the "No video" badge and the bulk
      // re-transcode button can filter to only the rows that actually need
      // work (otherwise it dispatches a full pipeline re-run for every
      // single vlog — wasteful).
      const { r2_key: _omit1, transcoded_r2_key, thumbnail_r2_key: _omit3, ...safe } = r
      return { ...safe, thumbnail_url, has_transcoded: !!transcoded_r2_key }
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

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Decode a base64-encoded payload to a Uint8Array. Tolerant of the optional
 * "data:image/jpeg;base64," prefix and of whitespace inside the string.
 * Returns an empty array on garbage input (caller treats <1KB result as fail).
 */
function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')
  try {
    const bin = atob(cleaned)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return new Uint8Array(0)
  }
}
