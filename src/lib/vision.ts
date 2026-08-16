/**
 * Vision tagging — describe a photo with a Workers-AI multimodal model.
 *
 * The photo archive's "understand without labeling" step, parallel to Whisper
 * for videos. For each uploaded photo we produce a one-line description + a
 * handful of tags so the archive is searchable and the graph can link photos
 * to subjects (e.g. every "strength training" photo + every vlog where the
 * operator talks about it).
 *
 * Runs on Workers AI (Llama 4 Scout — multimodal, cheap, in-house) via the
 * existing callChat abstraction. The image is fed as a base64 data URI read
 * from R2. On any error the caller records vision_status='failed' and moves
 * on — a photo lands in the photo archive whether or not tagging succeeded; tagging
 * is enhancement, never a gate.
 */

import type { Ai, D1Database } from '@cloudflare/workers-types'
import { callChat } from './llm'
import { getObject, type R2Env } from './r2'
import { findMany, run } from './d1'

export interface VisionEnv extends R2Env {
  AI: Ai
  DB?: D1Database
  ANTHROPIC_API_KEY?: string
}

export interface VisionResult {
  description: string
  tags: string[]
  model: string
}

const VISION_MODEL_KEY = 'scout' as const  // Llama 4 Scout — multimodal, in-house
const MAX_IMAGE_BYTES = 6 * 1024 * 1024     // skip enormous originals; display JPEGs are small

const SYSTEM = `You describe a personal photo for the operator's own archive.
Return ONE JSON object, no markdown:
{"description":"<one plain sentence, what's in the photo — subject, setting, notable detail>","tags":["<3-8 short lowercase tags: people, place, activity, objects, mood>"]}
Be concrete and factual. No hashtags, no marketing, no guessing identities of specific people (use "a person" / "two people"). If it's a progress/fitness photo, say so plainly.`

/**
 * Describe an image already stored in R2. Returns null on any failure
 * (bytes missing, too large, model error, unparseable output).
 */
export async function describeImageFromR2(
  env: VisionEnv,
  r2Key: string,
  mimeType = 'image/jpeg',
): Promise<VisionResult | null> {
  let dataUri: string
  try {
    const obj = await getObject(env, r2Key)
    if (!obj) return null
    const buf = await obj.arrayBuffer()
    if (buf.byteLength > MAX_IMAGE_BYTES) return null
    dataUri = `data:${mimeType};base64,${bytesToBase64(new Uint8Array(buf))}`
  } catch (err: any) {
    console.warn(`[vision] read failed for ${r2Key}: ${err?.message || err}`)
    return null
  }

  try {
    const res = await callChat(env as any, {
      model: VISION_MODEL_KEY,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this photo for my archive.' },
          { type: 'image_url', image_url: { url: dataUri } },
        ],
      }],
      maxTokens: 300,
      temperature: 0.2,
    })
    const parsed = parseVision(res.text)
    if (!parsed) return null
    return { ...parsed, model: res.model || VISION_MODEL_KEY }
  } catch (err: any) {
    console.warn(`[vision] model call failed for ${r2Key}: ${err?.message || err}`)
    return null
  }
}

function parseVision(raw: string): { description: string; tags: string[] } | null {
  if (!raw) return null
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) {
    // Model returned prose instead of JSON — salvage it as the description.
    const text = cleaned.trim()
    return text.length >= 4 ? { description: text.slice(0, 400), tags: [] } : null
  }
  let obj: any
  try { obj = JSON.parse(cleaned.slice(start, end + 1)) } catch { return null }
  const description = String(obj.description ?? '').trim().slice(0, 400)
  if (!description) return null
  const tags = Array.isArray(obj.tags)
    ? obj.tags.map((t: any) => String(t ?? '').trim().toLowerCase()).filter(Boolean).slice(0, 8)
    : []
  return { description, tags }
}

/**
 * Works through the video vision-tagging backlog — every vlog whose
 * thumbnail exists but hasn't been described yet. Mirrors
 * judgeClipBacklog's shape exactly (src/lib/clip-judge.ts): bounded per
 * call, called from both the cron-fired refresh-drafts endpoint and a
 * page-visit waitUntil, so the backlog drains on its own without the
 * operator doing anything. Reuses describeImageFromR2 unchanged — a vlog
 * thumbnail is just another JPEG in R2.
 */
export async function visionTagVlogBacklog(
  env: VisionEnv,
  operatorId: string,
  max = 8,
): Promise<{ tagged: number; errors: number }> {
  const db = env.DB!
  const rows = await findMany<{ id: string; thumbnail_r2_key: string }>(
    db,
    `SELECT id, thumbnail_r2_key FROM vlogs
      WHERE operator_id = ? AND deleted_at IS NULL
        AND thumbnail_r2_key IS NOT NULL
        AND vision_status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?`,
    operatorId, max,
  )

  let tagged = 0
  let errors = 0
  for (const r of rows) {
    try {
      const result = await describeImageFromR2(env, r.thumbnail_r2_key, 'image/jpeg')
      if (result) {
        await run(
          db,
          `UPDATE vlogs SET vision_description = ?, vision_tags = ?, vision_model = ?,
                            vision_status = 'done', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          result.description, JSON.stringify(result.tags), result.model, r.id,
        )
        tagged++
      } else {
        await run(db, `UPDATE vlogs SET vision_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, r.id)
        errors++
      }
    } catch (err: any) {
      console.warn(`[vision] vlog backlog failed for ${r.id}: ${err?.message || err}`)
      try { await run(db, `UPDATE vlogs SET vision_status = 'failed' WHERE id = ?`, r.id) } catch {}
      errors++
    }
  }
  return { tagged, errors }
}

/** Chunked base64 encode — avoids call-stack limits on large buffers. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
