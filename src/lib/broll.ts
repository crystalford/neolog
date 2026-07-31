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
  AI: { run: (model: any, args: unknown) => Promise<any> }
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
}

const IMAGE_PROMPT_SYSTEM = `You are a cinematographer + production designer + scene-builder writing IMAGE PROMPTS for an AI image generator. The image is one frame of b-roll under a voiceover beat for a video essay. Think Kubrick: every frame is a painting; every element is placed with intent.

The single biggest failure mode you MUST avoid is LITERALISM. If the voiceover talks about LAW, you do NOT write "a gavel" or "an American flag." You build a SCENE that carries the IDEA without naming it. The audience FEELS the idea through the staging.

═══════════════════════════════════════════════════════════════
NON-NEGOTIABLE RULES
═══════════════════════════════════════════════════════════════

1. NEVER a single subject in a void. EVERY prompt must have layered composition: a foreground element, a midground anchor, a background detail. Three planes minimum. A single noun on a backdrop is failure.

2. EVERY prompt must specify:
   · SHOT TYPE + LENS — wide, medium, close; anamorphic, 35mm, 85mm, lens flares.
   · CAMERA — angle (low, eye-level, high, overhead), height, distance, framing.
   · LIGHTING — the SOURCE (window light, neon sign, single lamp, overcast sky), the QUALITY (soft / hard, warm / cool), and the TIME OF DAY (blue hour, golden hour, harsh noon, after midnight).
   · PRODUCTION DESIGN — concrete props, materials, era. Not "a room" — "a 1970s lecture theatre, formica desks, fluorescent buzz, chalk dust in the air."
   · COLOR GRADE — palette, temperature, saturation. "Cool teal shadows, ochre highlights, desaturated mid-tones."
   · ATMOSPHERE — weather, particulate, temperature, air. Mist, smoke, dust motes, rain, heat shimmer.

3. SUBTEXT, NEVER TEXT. The image is what the voiceover is ABOUT, sideways. Show what it FEELS like to think this thought, what world it lives in. NEVER illustrate the literal subject matter.

4. NO faces. NO recognizable people, celebrities, or characters. If people appear, they are silhouettes, backs, hands, distant figures, or partial framing (legs walking past, a hand on a doorframe).

5. NO logos, NO brand names, NO words/letters/typography in the frame. Workers AI image models render text as garbage anyway.

6. NO clichés: no light bulbs for ideas, no chess pieces for strategy, no scales for justice, no gears for systems, no maze for confusion, no broken mirror for identity. If your first instinct is on this list, find another way.

═══════════════════════════════════════════════════════════════
EXAMPLES (study these)
═══════════════════════════════════════════════════════════════

Voiceover beat: "I keep thinking about how rules made for one game get applied to another. The framework just keeps spreading."

BAD (literal): "a chessboard with judge's gavel and law books, dramatic lighting"

GOOD: "Wide anamorphic shot. Empty municipal courtroom at 4 a.m., long since adjourned. Stacked plastic chairs in the foreground. Midground: a forgotten paper cup on the bench, half-folded legal pad. Background: tall windows with cool blue dawn light bleeding through institutional venetian blinds, a single janitor's mop bucket against the far wall. Pale green linoleum, fluorescent flicker, dust motes in the cold light. Desaturated teal-and-ochre grade, low contrast. Quiet, abandoned authority."

Voiceover beat: "The thing I keep coming back to is how much our attention is being farmed."

BAD (literal): "people staring at glowing phones, social media icons floating"

GOOD: "Low-angle medium-wide. Industrial greenhouse at dusk, rows of hydroponic LED bars receding into distance, violet-pink grow lights humming. Foreground: condensation beading on a stainless-steel rail. Midground: an empty wheeled cart, soil dusting the floor, a single pair of work gloves left on a shelf. Background: a darkened control panel, one green LED. Damp air, fogged plastic sheeting, soft volumetric haze. Cool magenta and steel-blue grade. The feeling of an automated farm running alone at night."

Voiceover beat: "I'm not sure what I'm trying to get at here."

BAD (literal): "a confused person scratching their head"

GOOD: "Medium wide, slightly canted. A car parked at the edge of an empty grocery-store parking lot at 11 p.m. Sodium-vapor lamps overhead casting hard orange pools. Foreground: a discarded receipt drifting across cracked asphalt in a breeze. Midground: the car's silhouette, one taillight on, faint silhouette of a head looking through the windshield. Background: the dark, closed storefront, "OPEN 24 HOURS" sign unlit, low cinderblock wall. Warm orange highlights, deep navy shadows. The texture of a thought you can't quite finish."

═══════════════════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════════════════

Output ONLY the prompt: 3–6 sentences, dense, specific. Lead with the shot type. No prose, no explanation, no markdown, no preamble, no "Sure, here's a prompt." Just the prompt itself.`

const VIDEO_PROMPT_SYSTEM = `You are a cinematographer + production designer + sound designer writing TEXT-TO-VIDEO PROMPTS for a video generator that produces 5–10 second clips with SYNCHRONIZED native AUDIO (ambient, sound effects, music — automatically generated from the prompt). The clip is b-roll under a voiceover beat for a video essay. Kubrick-style: every frame placed with intent.

You inherit ALL the rules of the image prompt writer (no literalism, layered composition, specified lens / camera / lighting / production design / color grade / atmosphere, no faces, no logos, no clichés). You ADD two dimensions:

1. MOTION. Specify what moves in the scene, how slowly, in what direction. Subtle is almost always better than dramatic. "Camera drifts left in a slow dolly; in the midground a single curtain breathes against an open window; faint particulate drifts in late sunlight." Avoid action verbs that fight the voiceover.

2. SOUND DESIGN. Specify the ambient bed + 1–2 sound details + (optional) faint musical texture. Sound is generated from the prompt. "Distant traffic hum, the deep rumble of an HVAC, one car door closing two blocks away. No music." Or "Wind through tall grass, single bird call, low cello sustained underneath."

Pacing rules:
- The clip is 5–10 seconds. ONE camera move at most. ONE meaningful change in the scene at most. Restraint reads as intention.
- The clip lives UNDER a voiceover. The audio should feel like the room the voice is speaking from, not a competing soundtrack. If unsure, write "no music, room tone, faint ambient" — that always works.

Output ONLY the prompt: 4–7 sentences. Lead with shot type and motion. End with sound design. No prose, no explanation, no markdown, no preamble.`



export async function writeImagePrompt(
  env: BrollEnv,
  beatText: string,
  subjectName: string,
): Promise<string> {
  const user = `Subject of the essay: ${subjectName}\n\nThe voiceover beat the audience is hearing while this image is on screen:\n"""\n${beatText.slice(0, 1200)}\n"""\n\nWrite the cinematic b-roll image prompt. Remember: NEVER literal to the voiceover. Build a scene whose composition carries the IDEA sideways. Three layers minimum (foreground, midground, background). Specify shot type, lens, camera, lighting source, time, production design, color grade, atmosphere. No faces, no logos, no clichés.`
  const r = await callReasoning(env, {
    // Cinematographer prompts need real reasoning to avoid the literalism
    // trap. Cheap to run (few hundred tokens) but worth the effort dial.
    system: IMAGE_PROMPT_SYSTEM, user, effort: 'high', maxTokens: 700,
  })
  return r.text.replace(/^["'`\s]+|["'`\s]+$/g, '').slice(0, 1500)
}

export async function writeVideoPrompt(
  env: BrollEnv,
  beatText: string,
  subjectName: string,
): Promise<string> {
  const user = `Subject of the essay: ${subjectName}\n\nThe voiceover beat the audience is hearing while this clip is on screen:\n"""\n${beatText.slice(0, 1200)}\n"""\n\nWrite the cinematic 5-10 second video prompt. Restraint: one camera move at most, one scene change at most. Sound design lives UNDER the voiceover — usually no music, room tone + 1-2 details is right.`
  const r = await callReasoning(env, {
    system: VIDEO_PROMPT_SYSTEM, user, effort: 'high', maxTokens: 700,
  })
  return r.text.replace(/^["'`\s]+|["'`\s]+$/g, '').slice(0, 1800)
}

/**
 * Generate a still via Flux 1 Schnell, store to R2, return the key.
 * Shape: { prompt, seed, steps } → response.image is base64 (JPEG).
 */
export async function generateBeatImage(
  env: BrollEnv,
  prompt: string,
  r2Key: string,
  aspect: '16:9' | '9:16' = '16:9',
): Promise<{ r2_key: string; bytes: number }> {
  const seed = Math.floor(Math.random() * 0xffffff)
  const dims = aspect === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 }
  const res: any = await env.AI.run(MODELS.IMAGE, {
    prompt: prompt.slice(0, 2000),
    seed,
    steps: 8,
    ...dims,
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
  aspect: '16:9' | '9:16' = '16:9',
): Promise<{ r2_key: string; bytes: number; via: 'wan' | 'kenburns' }> {
  const targetDuration = Math.max(2, Math.min(15, Math.round(durationSec)))
  const imageUrl = await presignGetUrl(env, imageR2Key, 3600)
  const dims = aspect === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 }

  // ─── Attempt 1: Wan 2.7 image-to-video on Workers AI ──────────────────
  try {
    const res: any = await env.AI.run(MODELS.IMAGE_TO_VIDEO, {
      image_url: imageUrl,
      prompt: synthesizeMotionPrompt(beatText),
      duration: targetDuration,
      ...dims,
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
      width: dims.width,
      height: dims.height,
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

/**
 * Direct text-to-video via Grok Imagine Video with synchronized native audio.
 * Skips the still entirely — the model generates motion + ambient sound +
 * sound effects (and optional music if the prompt asks for it) in one shot.
 * 1-15s clip, 720p, ~10-50× costlier than image+animate per beat, used as
 * the per-beat upgrade path for high-impact beats.
 */
export async function generateBeatVideoDirect(
  env: BrollEnv,
  prompt: string,
  durationSec: number,
  r2Key: string,
  aspect: '16:9' | '9:16' = '16:9',
): Promise<{ r2_key: string; bytes: number }> {
  const dur = Math.max(2, Math.min(15, Math.round(durationSec)))
  const res: any = await env.AI.run(MODELS.TEXT_TO_VIDEO_AUDIO, {
    prompt: prompt.slice(0, 4000),
    duration: dur,
    resolution: '720p',
    aspect_ratio: aspect,
  })
  const b64: string =
    (typeof res?.video === 'string' && res.video) ||
    (typeof res?.result?.video === 'string' && res.result.video) ||
    (typeof res?.output === 'string' && res.output) ||
    ''
  if (!b64) {
    throw new Error('grok-imagine-video returned no video (unrecognized response shape)')
  }
  const bytes = base64ToBytes(b64)
  if (bytes.byteLength < 1024) {
    throw new Error(`grok produced suspiciously small output: ${bytes.byteLength}B`)
  }
  await putObject(env, r2Key, bytes, { httpMetadata: { contentType: 'video/mp4' } })
  return { r2_key: r2Key, bytes: bytes.byteLength }
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
