/**
 * POST /api/v2/vlogs/[id]/thumbnail
 *
 * Generate a real thumbnail for a single vlog and store it as a data: URI
 * in vlogs.thumbnail_url. For H.264 sources (or anything with a transcoded
 * fallback), FFmpeg extracts the frame directly in 1-2 seconds — the
 * workflow returns sync. For HEVC sources without a transcode, the workflow
 * falls through to the locked transcode-then-thumbnail chain (~10 min);
 * this endpoint returns 202 in that case and the operator should refresh
 * later.
 *
 * Dispatched via the PROCESS_UPLOAD service binding with extract_thumb_only.
 */
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  PROCESS_UPLOAD?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  if (!env.PROCESS_UPLOAD) {
    return NextResponse.json(
      { error: 'PROCESS_UPLOAD service binding missing.' },
      { status: 503 },
    )
  }

  const db = getDb(env)
  const vlog = await findOne<{
    id: string
    mime_type: string | null
    original_filename: string | null
    transcoded_r2_key: string | null
    thumbnail_url: string | null
  }>(
    db,
    `SELECT id, mime_type, original_filename, transcoded_r2_key, thumbnail_url
       FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!vlog) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (vlog.thumbnail_url) {
    return NextResponse.json({ ok: true, already: true, message: 'Thumbnail already exists.' })
  }

  // Detect whether the fast (H.264) path will work. The workflow makes the
  // final decision — this is just for the response code semantics.
  const mime = (vlog.mime_type || '').toLowerCase()
  const filename = (vlog.original_filename || '').toLowerCase()
  const isHevc =
    /hevc|hev1|hvc1|x265/.test(mime) ||
    mime === 'video/quicktime' ||
    filename.endsWith('.mov')
  const willTakeMinutes = isHevc && !vlog.transcoded_r2_key

  try {
    const res = await env.PROCESS_UPLOAD.fetch('https://internal/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vlog_id: params.id,
        operator_id: operator.id,
        extract_thumb_only: true,
      }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Workflow dispatch failed (${res.status}): ${errText.slice(0, 400)}`)
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to dispatch thumbnail workflow: ${err.message}` },
      { status: 500 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      will_transcode: willTakeMinutes,
      message: willTakeMinutes
        ? 'HEVC source — will transcode first, expect ~10 min. Refresh to see thumbnail.'
        : 'H.264 source — thumbnail extracting now. Refresh in a few seconds.',
    },
    { status: willTakeMinutes ? 202 : 200 },
  )
}
