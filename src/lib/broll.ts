/**
 * AI b-roll generation utilities. All Cloudflare Workers AI + R2 — no third
 * party. The full pipeline per beat:
 *
 *   beat text → cinematic image prompt (gpt-oss)
 *            → 1024×1024 still (Flux 1 Schnell)
 *            → 5-10s clip (Wan 2.7 image-to-video, fallback: FFmpeg Ken Burns)
 *
 * Outputs land on R2 at:
 *   {operator}/broll/{production_id}/{beat_index}.jpg     (still)
 *   {operator}/broll/{production_id}/{beat_index}.mp4     (clip)
 *
 * The render step picks these up via /render-video-essay with the per-beat
 * clip URLs paired to per-beat voiceover MP3s.
 */

import { callReasoning, MODELS, extractText } from './models'
import { putObject, presignGetUrl, type R2Env } from './r2'

export interface BrollEnv extends R2Env {
  AI: { run: (model: string, args: unknown) => Promise<any> }
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
}

const IMAGE_PROMPT_SYSTEM = `You write cinematic IMAGE PROMPTS for AI image generation. The image is b-roll for a video essay voiceover beat — atmospheric, evocative, NOT literal.

RULES:
- 1-2 sentences. Concrete visual nouns. Lighting (golden hour, overcast, neon), camera angle (low, wide, close), color grade (cool blue, warm desaturated), mood (still, kinetic, lonely).
- NEVER describe people's faces, recognizable celebrities, or specific brand logos.
- NEVER include text in the image.
- AVOID anything literal to the spoken words — show the FEELING and ENVIRONMENT, not the subject matter directly. Spoken "I was thinking about how I procrastinate" → image is "an empty desk at golden hour, soft light through tall windows, single chair pushed back."
- Prefer wide landscapes, architecture, environmental detail, abstract textures.

Output ONLY the prompt sentence(s), no prose, no explanation, no markdown.`

export async function writeImagePrompt(
  env: BrollEnv,
  beatText: string,
  subjectName: string,
): Promise<string> {
  const user = `Subject: ${subjectName}\n\nBeat (spoken voiceover):\n${beatText.slice(0, 1200)}\n\nWrite the cinematic b-roll image prompt.`
  const r = await callReasoning(env, {
    system: IMAGE_PROMPT_SYSTEM, user, effort: 'low', maxTokens: 200,
  })
  return r.text.replace(/^["'`\s]+|["'`\s]+$/g, '').slice(0, 480)
}

/**
 * Generate a still via Flux 1 Schnell, store to R2, return the key.
 * Shape: { prompt, seed, steps } → response.image is base64 (JPEG).
 */
export async function generateBeatImage(
  env: BrollEnv,
  prompt: string,
  r2Key: string,
): Promise<{ r2_key: string; bytes: number }> {
  const seed = Math.floor(Math.random() * 0xffffff)
  const res: any = await env.AI.run(MODELS.IMAGE, {
    prompt: prompt.slice(0, 2000),
    seed,
    steps: 8,
  })
  // Workers AI flux returns { image: "<base64>" }. Some catalog versions
  // have returned a ReadableStream or { result: { image: ... } } — handle
  // all three.
  const b64: string =
    (typeof res?.image === 'string' && res.image) ||
    (typeof res?.result?.image === 'string' && res.result.image) ||
    ''
  if (!b64) {
    throw new Error('flux returned no image (unrecognized response shape)')
  }
  const bytes = base64ToBytes(b64)
  await putObject(env, r2Key, bytes, { httpMetadata: { contentType: 'image/jpeg' } })
  return { r2_key: r2Key, bytes: bytes.byteLength }
}

/**
 * Animate a still into a short clip. First try Wan 2.7 (image-to-video) on
 * Workers AI; if that errors, fall back to FFmpeg Ken Burns (zoom-and-pan)
 * so we ALWAYS produce a clip. Returns the clip's R2 key.
 */
export async function animateBeatImage(
  env: BrollEnv,
  imageR2Key: string,
  beatText: string,
  durationSec: number,
  clipR2Key: string,
): Promise<{ r2_key: string; bytes: number; via: 'wan' | 'kenburns' }> {
  const targetDuration = Math.max(2, Math.min(15, Math.round(durationSec)))
  const imageUrl = await presignGetUrl(env, imageR2Key, 3600)

  // ─── Attempt 1: Wan 2.7 image-to-video on Workers AI ──────────────────
  try {
    const res: any = await env.AI.run(MODELS.IMAGE_TO_VIDEO, {
      image_url: imageUrl,
      prompt: synthesizeMotionPrompt(beatText),
      duration: targetDuration,
      width: 1280,
      height: 720,
    })
    const b64: string =
      (typeof res?.video === 'string' && res.video) ||
      (typeof res?.result?.video === 'string' && res.result.video) ||
      ''
    if (b64) {
      const bytes = base64ToBytes(b64)
      if (bytes.byteLength >= 1024) {
        await putObject(env, clipR2Key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
        return { r2_key: clipR2Key, bytes: bytes.byteLength, via: 'wan' }
      }
    }
    console.warn(`[broll] Wan returned no usable video for ${imageR2Key}; falling back to Ken Burns`)
  } catch (err: any) {
    console.warn(`[broll] Wan call failed (${err?.message || err}); falling back to Ken Burns`)
  }

  // ─── Attempt 2: FFmpeg Ken Burns from the still ───────────────────────
  if (!env.FFMPEG) {
    throw new Error('image-to-video failed and no FFMPEG binding available for Ken Burns fallback')
  }
  const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/ken-burns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      duration_sec: targetDuration,
      width: 1280,
      height: 720,
    }),
  } as RequestInit)
  if (!ffResp.ok) {
    const body = (await ffResp.text()).slice(0, 400)
    throw new Error(`ffmpeg /ken-burns failed: ${ffResp.status} ${body}`)
  }
  const mp4 = new Uint8Array(await ffResp.arrayBuffer())
  if (mp4.byteLength < 1024) throw new Error(`ken-burns produced tiny output: ${mp4.byteLength}B`)
  await putObject(env, clipR2Key, mp4, { httpMetadata: { contentType: 'video/mp4' } })
  return { r2_key: clipR2Key, bytes: mp4.byteLength, via: 'kenburns' }
}

// Image-to-video models work best with a hint about motion. Pull a verb-y
// fragment from the beat to nudge subtle motion, but never make the clip
// literal to the spoken words.
function synthesizeMotionPrompt(beatText: string): string {
  // Strip [BEAT: ...] header if present.
  const body = beatText.replace(/^\s*\[BEAT[^\]]*\]\s*/i, '').trim()
  // Truncate to a short hint — the image is the visual, not this string.
  const hint = body.split(/[.!?]/)[0].slice(0, 140)
  return `subtle cinematic camera motion, slow drift, soft parallax — ${hint}`
}

function base64ToBytes(b64: string): Uint8Array {
  // Strip data URI prefix if present.
  const clean = b64.replace(/^data:[^;]+;base64,/, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
