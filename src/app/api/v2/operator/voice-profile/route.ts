/**
 * Operator voice profile — the 10-second reference clip MiniMax 2.8
 * Turbo uses to clone the operator's voice for synthesized beats.
 *
 *   GET  → current profile metadata + sample URL (or null)
 *   POST → upload a new 10s clip. Body: { audio_base64: string }.
 *          Stored at {operator}/voice/reference.mp3. Sets
 *          operator.voice_profile_r2_key + flips voice_synth_mode='clone'
 *          (unless the operator explicitly chose 'preset' before).
 *   DELETE → clear the profile + flip voice_synth_mode back to 'record'.
 *
 * The operator records the clip in the browser via MediaRecorder (same
 * flow used for per-beat voiceover) and uploads the base64 here. Small
 * payload (10s mp3 ≈ 80-160 KB), so JSON body is fine — no presigned URL
 * round-trip needed.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { putObject, deleteObject, presignGetUrl, type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const REFERENCE_KEY = (opId: string) => `${opId}/voice/reference.mp3`
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB cap — 10s of mp3 is way under

export async function GET(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const row = await findOne<{
    voice_profile_r2_key: string | null
    voice_synth_mode: string | null
    voice_synth_voice_id: string | null
  }>(
    getDb(env),
    `SELECT voice_profile_r2_key, voice_synth_mode, voice_synth_voice_id
       FROM operator WHERE id = ?`,
    operator.id,
  )
  let sample_url: string | null = null
  if (row?.voice_profile_r2_key) {
    try { sample_url = await presignGetUrl(env, row.voice_profile_r2_key, 3600) } catch {}
  }
  return NextResponse.json({
    has_profile: !!row?.voice_profile_r2_key,
    voice_synth_mode: row?.voice_synth_mode ?? 'record',
    voice_synth_voice_id: row?.voice_synth_voice_id ?? null,
    sample_url,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => null) as {
    audio_base64?: string
    mime_type?: string
    voice_synth_mode?: 'record' | 'clone' | 'preset'
    voice_synth_voice_id?: string
  } | null
  if (!body) {
    return NextResponse.json({ error: 'body required' }, { status: 400 })
  }

  // Settings-only update — no audio in this request. Used by the mode picker
  // and the preset-voice dropdown.
  if (!body.audio_base64) {
    const allowedModes = ['record', 'clone', 'preset']
    const updates: string[] = []
    const binds: unknown[] = []
    if (body.voice_synth_mode && allowedModes.includes(body.voice_synth_mode)) {
      updates.push('voice_synth_mode = ?')
      binds.push(body.voice_synth_mode)
    }
    if (typeof body.voice_synth_voice_id === 'string') {
      updates.push('voice_synth_voice_id = ?')
      binds.push(body.voice_synth_voice_id.slice(0, 80))
    }
    if (updates.length === 0) {
      return NextResponse.json({ error: 'audio_base64, voice_synth_mode, or voice_synth_voice_id required' }, { status: 400 })
    }
    updates.push('updated_at = CURRENT_TIMESTAMP')
    binds.push(operator.id)
    await run(
      getDb(env),
      `UPDATE operator SET ${updates.join(', ')} WHERE id = ?`,
      ...binds,
    )
    return NextResponse.json({ ok: true })
  }
  let bytes: Uint8Array
  try {
    const clean = body.audio_base64.replace(/^data:[^;]+;base64,/, '')
    const bin = atob(clean)
    bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  } catch {
    return NextResponse.json({ error: 'invalid base64 payload' }, { status: 400 })
  }
  if (bytes.byteLength < 1024) {
    return NextResponse.json({ error: 'audio too small (< 1 KB) — record longer' }, { status: 400 })
  }
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: `audio too large (${bytes.byteLength} > ${MAX_BYTES})` }, { status: 400 })
  }

  const key = REFERENCE_KEY(operator.id)
  const contentType = body.mime_type?.startsWith('audio/') ? body.mime_type : 'audio/mpeg'
  try {
    await putObject(env, key, bytes, { httpMetadata: { contentType } })
  } catch (err: any) {
    return NextResponse.json({ error: `R2 upload failed: ${err?.message || err}` }, { status: 500 })
  }

  // Default to clone mode once a profile exists, unless operator already
  // explicitly chose 'preset' (in which case we leave their pick alone).
  const existing = await findOne<{ voice_synth_mode: string | null }>(
    getDb(env), `SELECT voice_synth_mode FROM operator WHERE id = ?`, operator.id,
  )
  const nextMode = existing?.voice_synth_mode === 'preset' ? 'preset' : 'clone'
  await run(
    getDb(env),
    `UPDATE operator SET voice_profile_r2_key = ?, voice_synth_mode = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    key, nextMode, operator.id,
  )
  return NextResponse.json({ ok: true, voice_synth_mode: nextMode, bytes: bytes.byteLength })
}

export async function DELETE(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const key = REFERENCE_KEY(operator.id)
  try { await deleteObject(env, key) } catch {}
  await run(
    getDb(env),
    `UPDATE operator SET voice_profile_r2_key = NULL, voice_synth_mode = 'record', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    operator.id,
  )
  return NextResponse.json({ ok: true })
}
