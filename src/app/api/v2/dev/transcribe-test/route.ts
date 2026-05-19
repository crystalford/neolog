/**
 * POST /api/v2/dev/transcribe-test
 *
 * Bypasses the workflow / DO / softStep entirely. Fetches one audio object
 * from R2 and POSTs the raw bytes directly to Workers AI's REST endpoint.
 * Returns the full response (or error) so we can SEE what's happening
 * without the layers of retry/queue/event noise that's been hiding the
 * actual failure mode for days.
 *
 * Body (any of these works):
 *   { r2_key: "operator/uploads/.../audio/chunk_0.wav" }   ← explicit chunk
 *   { vlog_id: "..." }                                     ← first chunk for this vlog
 *
 * Returns:
 *   { ok: true,  bytes: N, ms: N, text: "...", raw: <whole CF response> }
 *   { ok: false, bytes: N, ms: N, error: "...", status, body }
 *
 * Operator usage:
 *   POST /api/v2/dev/transcribe-test  body { vlog_id: "01KRXH..." }
 *   → see the actual REST status + body. If 200, transcript works.
 *     If 401, token doesn't have Workers AI scope. If 400, model
 *     rejected the input (then we read the body to know why).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import type { D1Database, R2Bucket } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  VIDEOS: R2Bucket
  CLOUDFLARE_ACCOUNT_ID: string
  CLOUDFLARE_API_TOKEN?: string
  CF_AI_TOKEN?: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try {
    operator = await requireOperator(req, env)
  } catch (e) {
    if (e instanceof UnauthenticatedError) {
      return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    }
    throw e
  }

  const body = await req.json().catch(() => ({})) as { r2_key?: string; vlog_id?: string }

  // Resolve the R2 key
  let r2_key = body.r2_key
  if (!r2_key && body.vlog_id) {
    const row = await findOne<{ audio_chunks_json: string | null }>(
      getDb(env),
      `SELECT audio_chunks_json FROM vlogs WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      body.vlog_id, operator.id,
    )
    if (!row) {
      return NextResponse.json({ error: 'vlog not found' }, { status: 404 })
    }
    try {
      const chunks = row.audio_chunks_json ? JSON.parse(row.audio_chunks_json) : []
      if (Array.isArray(chunks) && chunks.length > 0) {
        r2_key = chunks[0].r2_key
      }
    } catch {}
    if (!r2_key) {
      return NextResponse.json({
        ok: false,
        error: 'no audio chunks for this vlog — run Force on Audio extract first, or pass an explicit r2_key',
      }, { status: 400 })
    }
  }
  if (!r2_key) {
    return NextResponse.json({ error: 'r2_key or vlog_id required' }, { status: 400 })
  }
  if (!r2_key.startsWith(operator.id + '/')) {
    return NextResponse.json({ error: 'r2_key does not belong to operator' }, { status: 403 })
  }

  const obj = await env.VIDEOS.get(r2_key)
  if (!obj) {
    return NextResponse.json({ error: `R2 object not found: ${r2_key}` }, { status: 404 })
  }
  const bytes = new Uint8Array(await obj.arrayBuffer())

  const token = env.CF_AI_TOKEN || env.CLOUDFLARE_API_TOKEN
  if (!token) {
    return NextResponse.json({
      ok: false,
      bytes: bytes.byteLength,
      error: 'no Workers AI token on env (CLOUDFLARE_API_TOKEN / CF_AI_TOKEN unset). The Pages project does not have it as a secret yet.',
    }, { status: 500 })
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/openai/whisper-large-v3-turbo`
  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'audio/wav',
      },
      body: bytes,
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      bytes: bytes.byteLength,
      ms: Date.now() - t0,
      r2_key,
      url,
      error: `fetch threw: ${err?.message ?? err}`,
    }, { status: 500 })
  }
  const ms = Date.now() - t0
  const bodyText = await res.text()
  let parsed: any = null
  try { parsed = JSON.parse(bodyText) } catch {}

  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      bytes: bytes.byteLength,
      ms,
      r2_key,
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body: bodyText.slice(0, 4000),
      parsed,
    }, { status: 200 })  // 200 so the operator sees the body, not a 500 page
  }

  const text = parsed?.result?.text ?? parsed?.result?.transcription ?? parsed?.text ?? null

  return NextResponse.json({
    ok: true,
    bytes: bytes.byteLength,
    ms,
    r2_key,
    text,
    parsed,
    body: bodyText.slice(0, 800),
  })
}
