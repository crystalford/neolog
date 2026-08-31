/**
 * Synthesize voiceover for production beats using Cloudflare TTS.
 *
 *   POST /api/v2/productions/[id]/voiceover/synthesize
 *   body: {
 *     beat_indexes?: number[],   // default: all beats
 *     mode?: 'clone' | 'preset', // default: operator's current setting
 *     voice_id?: string,         // preset voice override
 *   }
 *
 * For each beat (sequential — UI tracks per-tile progress):
 *   - sanitize the beat text
 *   - call synthesizeBeat() — clone via MiniMax with the operator's 10s
 *     reference; falls back to Aura-2 preset if cloning errors
 *   - write the mp3 to {operator}/voiceover/{production}/{beat}.mp3
 *   - set production_beats.synth_audio_r2_key + .synth_voice_id
 *
 * Stitch step (existing /voiceover endpoint) prefers a recorded
 * audio_r2_key when both exist; otherwise it uses synth_audio_r2_key.
 * Mixed beats (some recorded, some synthesized) stitch fine.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany, run } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { synthesizeBeat, type TtsEnv } from '@/lib/tts'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends TtsEnv {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const { id: productionId } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    beat_indexes?: number[]
    mode?: 'clone' | 'preset'
    voice_id?: string
  }

  const db = getDb(env)
  const production = await findOne<{ id: string; production_type: string }>(
    db,
    `SELECT id, production_type FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    productionId, operator.id,
  )
  if (!production) return NextResponse.json({ error: 'production not found' }, { status: 404 })
  if (production.production_type !== 'video_essay') {
    return NextResponse.json({ error: 'voiceover synthesis only applies to video_essay productions' }, { status: 400 })
  }

  // Operator settings — fall back to body overrides.
  const op = await findOne<{
    voice_profile_r2_key: string | null
    voice_synth_mode: string | null
    voice_synth_voice_id: string | null
  }>(
    db,
    `SELECT voice_profile_r2_key, voice_synth_mode, voice_synth_voice_id
       FROM operator WHERE id = ?`,
    operator.id,
  )
  const effectiveMode: 'clone' | 'preset' = body.mode
    ?? (op?.voice_synth_mode === 'preset' ? 'preset' : (op?.voice_profile_r2_key ? 'clone' : 'preset'))
  const effectiveVoiceId = body.voice_id ?? op?.voice_synth_voice_id ?? 'asteria'
  if (effectiveMode === 'clone' && !op?.voice_profile_r2_key) {
    return NextResponse.json({
      error: 'cannot clone — no voice profile saved. Record a 10-second sample in Settings first.',
    }, { status: 400 })
  }

  const beats = await findMany<{
    id: string; beat_index: number; beat_text: string
  }>(
    db,
    `SELECT id, beat_index, beat_text FROM production_beats
      WHERE production_id = ?
      ORDER BY beat_index ASC`,
    productionId,
  )
  if (beats.length === 0) {
    return NextResponse.json({ error: 'no beats on this production yet' }, { status: 400 })
  }
  const selected = Array.isArray(body.beat_indexes) && body.beat_indexes.length > 0
    ? beats.filter(b => body.beat_indexes!.includes(b.beat_index))
    : beats

  const results: Array<{
    beat_index: number; status: 'ok' | 'failed'
    r2_key?: string; model?: string; via?: string; fellBack?: boolean
    error?: string
  }> = []

  for (const b of selected) {
    const outKey = `${operator.id}/voiceover/${productionId}/${b.beat_index}.mp3`
    try {
      const out = await synthesizeBeat(env, {
        text: b.beat_text,
        mode: effectiveMode,
        voiceProfileR2Key: op?.voice_profile_r2_key ?? undefined,
        voiceId: effectiveVoiceId,
        outR2Key: outKey,
      })
      await run(
        db,
        `UPDATE production_beats
            SET synth_audio_r2_key = ?, synth_voice_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        out.r2_key,
        out.via === 'clone' ? `clone:${op?.voice_profile_r2_key ?? '?'}` : `preset:${effectiveVoiceId}`,
        b.id,
      )
      results.push({
        beat_index: b.beat_index, status: 'ok', r2_key: out.r2_key,
        model: out.model, via: out.via, fellBack: out.fellBack,
      })
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.warn(`[voiceover.synthesize] beat ${b.beat_index} failed: ${msg}`)
      results.push({ beat_index: b.beat_index, status: 'failed', error: msg.slice(0, 400) })
    }
  }

  return NextResponse.json({
    ok: true, production_id: productionId, mode: effectiveMode, voice_id: effectiveVoiceId,
    results,
    successes: results.filter(r => r.status === 'ok').length,
    failures: results.filter(r => r.status === 'failed').length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
