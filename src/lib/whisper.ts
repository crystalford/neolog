/**
 * Workers AI Whisper invocation with format auto-detection.
 *
 * `@cf/openai/whisper-large-v3-turbo` rejects every JSON-encoded shape
 * because the AI binding base64-encodes binary values into strings, and
 * the model schema requires `audio` to be `array` or `binary` — never a
 * string. The decisive evidence:
 *
 *   array: 5006: ... '/audio', 'string' not in 'array','binary'
 *
 * The fix is to bypass the binding's JSON layer entirely and POST the raw
 * audio bytes to the Workers AI REST endpoint with
 * `Content-Type: audio/wav`. That delivers the audio as `binary` (the type
 * the schema actually accepts), no JSON encoding involved.
 *
 * Try order:
 *   1-8 — JSON shapes via env.AI.run (kept in case a future binding update
 *         makes them work; cheap to attempt and cached on success).
 *   9   — Direct REST POST with raw bytes. Requires
 *         env.CLOUDFLARE_ACCOUNT_ID + env.CF_AI_TOKEN.
 */

import type { Ai } from '@cloudflare/workers-types'

const MODEL = '@cf/openai/whisper-large-v3-turbo'

export interface WhisperEnv {
  AI: Ai
  CLOUDFLARE_ACCOUNT_ID?: string
  // Either of these works — set whichever the deploy script puts on the
  // worker. We try CF_AI_TOKEN first because it's scoped narrower in
  // best-practice deploys; fall back to CLOUDFLARE_API_TOKEN if that's
  // what the operator set.
  CF_AI_TOKEN?: string
  CLOUDFLARE_API_TOKEN?: string
}

interface ShapeAttempt {
  name: string
  build: (bytes: Uint8Array) => unknown
}

function asAB(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(ab).set(bytes)
  return ab
}

const JSON_SHAPES: ShapeAttempt[] = [
  { name: 'blob',           build: bytes => ({ audio: new Blob([asAB(bytes)], { type: 'audio/wav' }) }) },
  { name: 'arraybuffer',    build: bytes => ({ audio: asAB(bytes) }) },
  { name: 'object-body',    build: bytes => ({ audio: { body: asAB(bytes) } }) },
  { name: 'object-data',    build: bytes => ({ audio: { data: Array.from(bytes) } }) },
  { name: 'object-content', build: bytes => ({ audio: { content: Array.from(bytes) } }) },
  { name: 'array',          build: bytes => ({ audio: Array.from(bytes) }) },
  { name: 'raw-uint8',      build: bytes => ({ audio: bytes }) },
  { name: 'object-blob',    build: bytes => ({ audio: { blob: new Blob([asAB(bytes)], { type: 'audio/wav' }) } }) },
]

let preferredShapeName: string | null = null

export async function runWhisper(env: WhisperEnv, bytes: Uint8Array): Promise<any> {
  const ordered = preferredShapeName
    ? [
        JSON_SHAPES.find(s => s.name === preferredShapeName)!,
        ...JSON_SHAPES.filter(s => s.name !== preferredShapeName),
      ]
    : JSON_SHAPES

  // Special-case the preferred shape if it's 'rest' — go straight there.
  if (preferredShapeName === 'rest') {
    const out = await tryRest(env, bytes)
    if (out !== null) return out
  }

  const attempts: { shape: string; err: string }[] = []

  for (const shape of ordered) {
    if (!shape) continue
    try {
      const input = shape.build(bytes)
      const result = await env.AI.run(MODEL as any, input as any)
      preferredShapeName = shape.name
      return result
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '')
      attempts.push({ shape: shape.name, err: msg.slice(0, 240) })
      // Only continue on the documented schema-mismatch errors.
      if (!/5006|required propert|Type mismatch|not in 'object'|not in 'array'|not in 'string'|not in 'binary'/i.test(msg)) {
        if (attempts.length >= 2) break
      }
    }
  }

  // Last resort — bypass the binding entirely. Send raw bytes to the
  // Workers AI REST endpoint with audio/wav content type. This is the
  // 'binary' input mode the schema actually accepts.
  try {
    const result = await tryRest(env, bytes)
    if (result !== null) {
      preferredShapeName = 'rest'
      return result
    }
    attempts.push({ shape: 'rest', err: 'CLOUDFLARE_ACCOUNT_ID + token missing — set CF_AI_TOKEN (or CLOUDFLARE_API_TOKEN) as a worker secret' })
  } catch (err: any) {
    attempts.push({ shape: 'rest', err: String(err?.message ?? err ?? '').slice(0, 240) })
  }

  throw new Error(
    `Whisper failed across all input shapes (${bytes.byteLength} bytes). Per-shape errors:\n` +
    attempts.map(a => `  • ${a.shape}: ${a.err}`).join('\n'),
  )
}

async function tryRest(env: WhisperEnv, bytes: Uint8Array): Promise<any | null> {
  const token = env.CF_AI_TOKEN || env.CLOUDFLARE_API_TOKEN
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  if (!token || !accountId) return null

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'audio/wav',
    },
    body: asAB(bytes),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`REST ${res.status}: ${errBody.slice(0, 400)}`)
  }
  const data: any = await res.json()
  // Workers AI REST wraps successful responses as { result, success, errors, messages }
  if (data?.success === false) {
    const e = (data.errors ?? []).map((x: any) => x.message ?? JSON.stringify(x)).join('; ')
    throw new Error(`REST returned success=false: ${e || 'no details'}`)
  }
  return data?.result ?? data
}
