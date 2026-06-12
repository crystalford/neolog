/**
 * Text-to-speech for voiceover synthesis.
 *
 * Two paths, same Cloudflare bill:
 *   1. CLONE — MiniMax Speech 2.8 Turbo clones the operator's voice from a
 *      5-10 second reference clip. The voice the audience hears is theirs.
 *   2. PRESET — Deepgram Aura-2 with a chosen preset voice. Used when
 *      cloning isn't desired OR when MiniMax errors (automatic fallback).
 *
 * `synthesizeBeat()` returns { audio, model, fellBack } so the UI can
 * surface which path actually produced the take — same envelope as
 * `callReasoning()` in models.ts. The fallback flag matters because the
 * MiniMax request shape (where the reference audio lives in the body) is
 * the part most likely to be off on first deploy; the fallback means the
 * feature ships before that's nailed down.
 */

import { MODELS } from './models'
import { putObject, presignGetUrl, type R2Env } from './r2'

export interface TtsEnv extends R2Env {
  AI: { run: (model: string, args: unknown) => Promise<any> }
}

export interface SynthArgs {
  /** The spoken text. Inline tags like (laughs), (sighs), (breath) are honoured by MiniMax. */
  text: string
  /** Path: clone uses the operator's reference clip; preset uses a voice id. */
  mode: 'clone' | 'preset'
  /** R2 key of the operator's 10s reference clip (mode='clone' only). */
  voiceProfileR2Key?: string
  /** Preset voice id (mode='preset' only; or used as fallback voice). */
  voiceId?: string
  /** Where to write the synthesized mp3 in R2. */
  outR2Key: string
}

export interface SynthResult {
  r2_key: string
  bytes: number
  model: string
  fellBack: boolean
  /** Path that actually produced the take. */
  via: 'clone' | 'preset_fallback' | 'preset'
}

const DEFAULT_PRESET_VOICE = 'asteria'

export async function synthesizeBeat(env: TtsEnv, args: SynthArgs): Promise<SynthResult> {
  const text = sanitizeForTts(args.text)
  if (!text) throw new Error('synthesizeBeat: empty text after sanitization')

  // ─── Attempt 1: clone via MiniMax 2.8 Turbo ───────────────────────────
  if (args.mode === 'clone' && args.voiceProfileR2Key) {
    try {
      const referenceUrl = await presignGetUrl(env, args.voiceProfileR2Key, 3600)
      const res: any = await env.AI.run(MODELS.TTS_CLONE, {
        text: text.slice(0, 4000),
        reference_audio: referenceUrl,
        format: 'mp3',
        speed: 1.0,
        pitch: 0,
        volume: 1.0,
      })
      const b64 = pickAudioBase64(res)
      if (b64) {
        const bytes = base64ToBytes(b64)
        if (bytes.byteLength >= 1024) {
          await putObject(env, args.outR2Key, bytes, {
            httpMetadata: { contentType: 'audio/mpeg' },
          })
          return {
            r2_key: args.outR2Key, bytes: bytes.byteLength,
            model: MODELS.TTS_CLONE, fellBack: false, via: 'clone',
          }
        }
      }
      console.warn(`[tts] MiniMax clone returned no usable audio; falling back to Aura-2`)
    } catch (err: any) {
      console.warn(`[tts] MiniMax clone failed (${err?.message || err}); falling back to Aura-2`)
    }
  }

  // ─── Attempt 2: Aura-2 preset (also the requested path when mode='preset') ──
  const voiceId = args.voiceId || DEFAULT_PRESET_VOICE
  const res: any = await env.AI.run(MODELS.TTS_PRESET, {
    text: text.slice(0, 4000),
    speaker: voiceId,
    encoding: 'mp3',
  })
  const b64 = pickAudioBase64(res)
  if (!b64) {
    throw new Error('aura-2 returned no audio (unrecognized response shape)')
  }
  const bytes = base64ToBytes(b64)
  if (bytes.byteLength < 1024) {
    throw new Error(`aura-2 produced suspiciously small audio: ${bytes.byteLength}B`)
  }
  await putObject(env, args.outR2Key, bytes, {
    httpMetadata: { contentType: 'audio/mpeg' },
  })
  return {
    r2_key: args.outR2Key, bytes: bytes.byteLength,
    model: MODELS.TTS_PRESET, fellBack: args.mode === 'clone', via: args.mode === 'clone' ? 'preset_fallback' : 'preset',
  }
}

/**
 * Strip [BEAT: ...] headers and any stray markdown so the TTS doesn't read
 * UI metadata aloud. Preserve interjection tags ((laughs), (sighs), etc.)
 * because MiniMax 2.8 acts on them.
 */
export function sanitizeForTts(raw: string): string {
  return raw
    .replace(/^\s*\[BEAT[^\]]*\]\s*/i, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function pickAudioBase64(res: any): string {
  if (!res) return ''
  if (typeof res.audio === 'string') return res.audio
  if (typeof res.audio_base64 === 'string') return res.audio_base64
  if (typeof res.result?.audio === 'string') return res.result.audio
  if (typeof res.output === 'string') return res.output
  if (typeof res.mp3 === 'string') return res.mp3
  return ''
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, '')
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Static list of preset voices for the Settings picker. Mirrors what the
 * Workers AI Aura-2 model exposes. Kept inline so the UI can render
 * without a round-trip to /api/v2/voice/presets — call that endpoint only
 * if you want sample-audio preview URLs.
 */
export const PRESET_VOICES: { id: string; label: string; gender: 'f' | 'm' | 'n' }[] = [
  { id: 'asteria',  label: 'Asteria — warm, conversational',     gender: 'f' },
  { id: 'luna',     label: 'Luna — soft, late-night',            gender: 'f' },
  { id: 'helena',   label: 'Helena — measured, journalistic',    gender: 'f' },
  { id: 'iris',     label: 'Iris — bright, energetic',           gender: 'f' },
  { id: 'andromeda',label: 'Andromeda — calm, documentary',      gender: 'f' },
  { id: 'apollo',   label: 'Apollo — clean, broadcast',          gender: 'm' },
  { id: 'orion',    label: 'Orion — low, deliberate',            gender: 'm' },
  { id: 'hermes',   label: 'Hermes — agile, narrative',          gender: 'm' },
  { id: 'atlas',    label: 'Atlas — grounded, essayistic',       gender: 'm' },
  { id: 'orpheus',  label: 'Orpheus — soft, contemplative',      gender: 'm' },
]
