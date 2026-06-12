/**
 * POST /api/v2/productions/[id]/broll
 *
 * AI b-roll for a video essay. For each beat in production_beats, in order:
 *   1. gpt-oss writes a cinematic image prompt from the beat text + subject.
 *   2. Flux 1 Schnell generates a 1024×1024 still → R2.
 *   3. Wan 2.7 animates the still into a 5-10s clip → R2.
 *      (Fallback: FFmpeg Ken-Burns from the still — always produces a clip.)
 *
 * All Cloudflare Workers AI + R2; no third party.
 *
 * Body (all optional):
 *   - stage: 'image' | 'video' | 'both'    (default 'both')
 *   - beat_indexes: number[]               (default: all beats; for regen)
 *
 * Returns per-beat status so the operator UI can show progress + previews.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { writeImagePrompt, writeVideoPrompt, generateBeatImage, animateBeatImage, generateBeatVideoDirect, type BrollEnv } from '@/lib/broll'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends BrollEnv {
  DB: D1Database
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

const DEFAULT_BEAT_SECONDS = 7

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
    stage?: 'image' | 'video' | 'both' | 'direct_video'
    beat_indexes?: number[]
    // Per-beat mode: 'imageanimate' (default, cheap, Flux + Wan + Ken-Burns
    // fallback) or 'direct_video' (Grok Imagine, slower + costlier but
    // includes synchronized native audio).
    mode?: 'imageanimate' | 'direct_video'
  }
  const stage = body.stage ?? (body.mode === 'direct_video' ? 'direct_video' : 'both')

  const db = getDb(env)
  const production = await findOne<{
    id: string; operator_id: string; source_kind: string; source_id: string
    production_type: string
  }>(
    db,
    `SELECT id, operator_id, source_kind, source_id, production_type
       FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    productionId, operator.id,
  )
  if (!production) return NextResponse.json({ error: 'production not found' }, { status: 404 })
  if (production.production_type !== 'video_essay') {
    return NextResponse.json({ error: 'b-roll only applies to video_essay productions' }, { status: 400 })
  }

  // Subject name (for richer prompts) — cluster source only.
  let subjectName = 'an idea'
  if (production.source_kind === 'cluster') {
    const c = await findOne<{ topic: string }>(
      db,
      `SELECT topic FROM clusters WHERE id = ? AND operator_id = ?`,
      production.source_id, operator.id,
    )
    if (c?.topic) subjectName = c.topic
  }

  // Beat selection.
  const beatRows = await findMany<{
    id: string; beat_index: number; beat_text: string
    audio_r2_key: string | null
    broll_image_r2_key: string | null
    broll_video_r2_key: string | null
    broll_prompt: string | null
  }>(
    db,
    `SELECT id, beat_index, beat_text, audio_r2_key,
            broll_image_r2_key, broll_video_r2_key, broll_prompt
       FROM production_beats
      WHERE production_id = ?
      ORDER BY beat_index ASC`,
    productionId,
  )
  if (beatRows.length === 0) {
    return NextResponse.json({ error: 'production has no beats yet' }, { status: 400 })
  }
  const selectedBeats = Array.isArray(body.beat_indexes) && body.beat_indexes.length > 0
    ? beatRows.filter(b => body.beat_indexes!.includes(b.beat_index))
    : beatRows

  // Per-beat duration estimate (used by the animator). If audio is recorded,
  // we'd ideally read its duration — but we don't have a probe step here, so
  // estimate from word count at ~2.6 wps. Capped to Wan's 2–15s.
  const estimateDuration = (beatText: string): number => {
    const words = beatText.split(/\s+/).filter(Boolean).length
    const sec = Math.max(3, Math.min(12, Math.round(words / 2.6)))
    return sec
  }

  // Mark all selected beats as in-flight so the UI can show "generating".
  for (const b of selectedBeats) {
    await db.prepare(
      `UPDATE production_beats SET broll_status = 'generating',
                                   updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
    ).bind(b.id).run()
  }

  const results: Array<{
    beat_index: number; status: 'image' | 'video' | 'failed'
    image_r2_key?: string; video_r2_key?: string
    via?: 'wan' | 'kenburns' | 'grok'; error?: string; prompt?: string
  }> = []

  for (const beat of selectedBeats) {
    try {
      // ── Direct-video stage ─────────────────────────────────────────
      // Grok Imagine: text → video with native synchronized audio. Skip
      // the still entirely. Costlier + slower, but the only path that
      // produces ambient sound under the clip.
      if (stage === 'direct_video') {
        const prompt = await writeVideoPrompt(env, beat.beat_text, subjectName)
        const dur = estimateDuration(beat.beat_text)
        const videoKey = `${operator.id}/broll/${productionId}/${beat.beat_index}.mp4`
        const out = await generateBeatVideoDirect(env, prompt, dur, videoKey)
        await db.prepare(
          `UPDATE production_beats
              SET broll_video_r2_key = ?, broll_prompt = ?, broll_status = 'video_grok',
                  broll_duration_sec = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).bind(out.r2_key, prompt, dur, beat.id).run()
        results.push({
          beat_index: beat.beat_index, status: 'video',
          video_r2_key: out.r2_key, via: 'grok', prompt,
        })
        continue
      }

      // ── Image stage ────────────────────────────────────────────────
      let imageKey = beat.broll_image_r2_key
      let prompt = beat.broll_prompt
      if (stage === 'image' || stage === 'both' || !imageKey) {
        prompt = await writeImagePrompt(env, beat.beat_text, subjectName)
        const targetKey = `${operator.id}/broll/${productionId}/${beat.beat_index}.jpg`
        await generateBeatImage(env, prompt, targetKey)
        imageKey = targetKey
        await db.prepare(
          `UPDATE production_beats
              SET broll_image_r2_key = ?, broll_prompt = ?, broll_status = 'image',
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).bind(imageKey, prompt, beat.id).run()
      }

      // ── Animate stage (Wan 2.7 image-to-video; Ken-Burns fallback) ─
      if (stage === 'video' || stage === 'both') {
        if (!imageKey) throw new Error('no image to animate')
        const dur = estimateDuration(beat.beat_text)
        const videoKey = `${operator.id}/broll/${productionId}/${beat.beat_index}.mp4`
        const out = await animateBeatImage(env, imageKey, beat.beat_text, dur, videoKey)
        await db.prepare(
          `UPDATE production_beats
              SET broll_video_r2_key = ?, broll_status = 'video',
                  broll_duration_sec = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        ).bind(out.r2_key, dur, beat.id).run()
        results.push({
          beat_index: beat.beat_index, status: 'video',
          image_r2_key: imageKey, video_r2_key: out.r2_key,
          via: out.via, prompt: prompt ?? undefined,
        })
        continue
      }
      results.push({
        beat_index: beat.beat_index, status: 'image',
        image_r2_key: imageKey ?? undefined, prompt: prompt ?? undefined,
      })
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.warn(`[broll] beat ${beat.beat_index} failed: ${msg}`)
      await db.prepare(
        `UPDATE production_beats SET broll_status = 'failed', updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
      ).bind(beat.id).run()
      results.push({ beat_index: beat.beat_index, status: 'failed', error: msg.slice(0, 400) })
    }
  }

  return NextResponse.json({
    ok: true,
    production_id: productionId,
    stage,
    results,
    successes: results.filter(r => r.status !== 'failed').length,
    failures: results.filter(r => r.status === 'failed').length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
