/**
 * Auto-promote pipeline — turns a vlog's top clip candidates into
 * shipped shorts and queues them for social-platform fanout via the
 * operator's configured webhook (Make.com / Buffer / Zapier / direct
 * worker — whatever they wire up).
 *
 * Reusable from two callers:
 *   1. The post-upload Workflow's auto-promote step (after extraction).
 *   2. POST /api/v2/vlogs/[id]/auto-publish-now (manual re-run).
 *
 * Zero LLM in the slicing — verbatim quote is the soul of the clip. A
 * small low-effort gpt-oss call drafts a 200-char caption that wraps
 * the verbatim with voice-shape so it doesn't sound like a generic
 * LLM packaging.
 */

import type { D1Database, Ai } from '@cloudflare/workers-types'
import { getDb, findOne, findMany, run } from './d1'
import { presignGetUrl, getObject, putObject, type R2Env } from './r2'
import { ulid } from './ulid'
import { callReasoning } from './models'
import { loadVoiceSamples, formatVoiceSamples } from './voice-shape'
import { judgeUnscoredClipsForVlog, SCORE_FLOOR_FOR_AUTO_PUBLISH } from './clip-judge'

export interface AutoPromoteEnv extends R2Env {
  DB: D1Database
  AI: Ai
  FFMPEG?: { fetch: (req: string | Request, init?: RequestInit) => Promise<Response> }
}

const MAX_SEGMENT_SEC = 90       // hard cap per clip
const MIN_QUOTE_CHARS = 80
const MAX_QUOTE_CHARS = 280
const MIN_DURATION_SEC = 8
const MAX_DURATION_SEC = 60
const PRESIGN_TTL_SEC = 7 * 24 * 3600  // long-lived so the fanout vendor doesn't expire mid-queue

export interface AutoPromoteSummary {
  operator_id: string
  vlog_id: string
  considered: number
  selected: number
  shipped: number
  posted: number
  webhook_fired: boolean
  errors: { stage: string; clip_id?: string; message: string }[]
  clips: {
    clip_id: string
    production_id: string
    post_id: string
    mp4_key: string
    duration_sec: number
    caption: string
  }[]
}

/**
 * The whole flow for one vlog. Idempotent: every step checks for a
 * prior result and skips work that's already done.
 */
export async function autoPromoteVlog(
  env: AutoPromoteEnv,
  operatorId: string,
  vlogId: string,
): Promise<AutoPromoteSummary> {
  const db = getDb(env)
  const summary: AutoPromoteSummary = {
    operator_id: operatorId,
    vlog_id: vlogId,
    considered: 0,
    selected: 0,
    shipped: 0,
    posted: 0,
    webhook_fired: false,
    errors: [],
    clips: [],
  }

  const op = await findOne<{
    social_fanout_webhook_url: string | null
    auto_publish_max_per_vlog: number | null
  }>(
    db,
    `SELECT social_fanout_webhook_url, auto_publish_max_per_vlog
       FROM operator WHERE id = ?`,
    operatorId,
  )
  const maxPerVlog = Math.max(1, Math.min(10, op?.auto_publish_max_per_vlog ?? 2))
  const webhookUrl = op?.social_fanout_webhook_url ?? null

  const candidates = await selectTopClips(env, operatorId, vlogId, maxPerVlog)
  summary.considered = candidates.totalConsidered
  summary.selected = candidates.picks.length

  for (const c of candidates.picks) {
    try {
      const shipped = await shipClip(env, operatorId, c)
      summary.shipped++

      const caption = await draftClipCaption(env, c).catch(err => {
        summary.errors.push({ stage: 'caption', clip_id: c.id, message: err?.message || String(err) })
        return c.quote || c.headline
      })

      const postId = await enqueuePost(db, operatorId, shipped.productionId, c, caption)

      let mp4Url: string | null = null
      try { mp4Url = await presignGetUrl(env, shipped.mp4Key, PRESIGN_TTL_SEC) } catch {}

      summary.clips.push({
        clip_id: c.id,
        production_id: shipped.productionId,
        post_id: postId,
        mp4_key: shipped.mp4Key,
        duration_sec: shipped.durationSec,
        caption,
      })

      if (webhookUrl && mp4Url) {
        const fired = await fireFanoutWebhook(webhookUrl, {
          clip_id: c.id,
          production_id: shipped.productionId,
          post_id: postId,
          vlog_id: vlogId,
          mp4_url: mp4Url,
          mp4_expires_in_sec: PRESIGN_TTL_SEC,
          caption,
          duration_sec: shipped.durationSec,
          headline: c.headline,
          source_recorded_at: c.vlog_recorded_at,
        })
        if (fired.ok) {
          summary.webhook_fired = true
          summary.posted++
          // Flip the post into 'scheduled' so the home page can show the
          // ribbon. We don't know per-platform completion until the
          // fanout vendor pings us back; that's v2.
          await run(
            db,
            `UPDATE posts SET state = 'scheduled', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            postId,
          )
        } else {
          summary.errors.push({ stage: 'webhook', clip_id: c.id, message: fired.message })
        }
      }
    } catch (err: any) {
      summary.errors.push({ stage: 'ship', clip_id: c.id, message: err?.message || String(err) })
    }
  }

  // Clear the pending flag regardless of per-clip errors — if we got
  // here, we made one pass at this vlog. The errors are recorded in
  // the summary; re-runs are operator-initiated via the manual endpoint.
  try {
    await run(
      db,
      `UPDATE vlogs SET auto_publish_pending = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
      vlogId, operatorId,
    )
  } catch {}

  return summary
}

/**
 * Sweep — find every vlog flagged auto_publish_pending=1 for this
 * operator and run autoPromoteVlog on each. Used by /api/v2/refresh-drafts
 * (cron-triggerable) and by the home page in ctx.waitUntil so visits
 * fire pending publishes within seconds.
 *
 * Bounded — at most `maxVlogs` per sweep, so a backlog doesn't blow
 * the wall-clock on a single call.
 */
export async function sweepPendingAutoPublish(
  env: AutoPromoteEnv,
  operatorId: string,
  maxVlogs = 3,
): Promise<{ swept: number; summaries: AutoPromoteSummary[] }> {
  const db = getDb(env)
  const pending = await findMany<{ id: string }>(
    db,
    `SELECT id FROM vlogs
      WHERE operator_id = ? AND auto_publish_pending = 1 AND deleted_at IS NULL
      ORDER BY updated_at ASC
      LIMIT ?`,
    operatorId, maxVlogs,
  )
  const summaries: AutoPromoteSummary[] = []
  for (const v of pending) {
    try {
      summaries.push(await autoPromoteVlog(env, operatorId, v.id))
    } catch (err: any) {
      summaries.push({
        operator_id: operatorId,
        vlog_id: v.id,
        considered: 0, selected: 0, shipped: 0, posted: 0,
        webhook_fired: false,
        errors: [{ stage: 'sweep', message: err?.message || String(err) }],
        clips: [],
      })
    }
  }
  return { swept: pending.length, summaries }
}

interface PickedClip {
  id: string
  vlog_id: string
  start_time: number
  end_time: number
  headline: string
  quote: string | null
  why_clippable: string | null
  vlog_recorded_at: string | null
  vlog_r2_key: string | null
  vlog_transcoded_r2_key: string | null
}

/**
 * Filter candidates → judge any un-scored ones via the clip-quality
 * pass → rank by clippability_score → return up to `limit` picks.
 *
 * The hard filter (length / duration / validated=1) cuts the obvious
 * non-starters before judging — judging is the expensive step
 * (~1-2s per candidate). The judge then assigns a 1-5 clippability
 * score that we threshold at SCORE_FLOOR_FOR_AUTO_PUBLISH so only
 * "would actually travel" clips get auto-shipped.
 */
export async function selectTopClips(
  env: AutoPromoteEnv,
  operatorId: string,
  vlogId: string,
  limit: number,
): Promise<{ totalConsidered: number; picks: PickedClip[] }> {
  const db = getDb(env)

  // First — judge any un-scored eligible candidates. Bounded so a backlog
  // doesn't blow the wall-clock. Persisted, so re-runs of the sweep are
  // free.
  try {
    await judgeUnscoredClipsForVlog({ AI: env.AI, DB: db } as any, operatorId, vlogId, 8)
  } catch (err: any) {
    console.warn(`[auto-promote] judging failed for vlog ${vlogId}: ${err?.message || err}`)
  }

  const rows = await findMany<PickedClip & {
    validated: number | null; status: string; clippability_score: number | null
  }>(
    db,
    `SELECT cc.id, cc.vlog_id, cc.start_time, cc.end_time,
            cc.headline, cc.quote, cc.why_clippable,
            cc.validated, cc.status, cc.clippability_score,
            v.recorded_at AS vlog_recorded_at,
            v.r2_key AS vlog_r2_key,
            v.transcoded_r2_key AS vlog_transcoded_r2_key
       FROM clip_candidates cc
       JOIN vlogs v ON v.id = cc.vlog_id
      WHERE cc.operator_id = ? AND cc.vlog_id = ?
        AND cc.deleted_at IS NULL
        AND cc.status = 'pending'
        AND v.deleted_at IS NULL`,
    operatorId, vlogId,
  )

  const eligible = rows.filter(r => {
    if (r.validated === 0) return false                 // verbatim check failed → never auto-post
    if (!r.quote) return false
    const ql = r.quote.length
    if (ql < MIN_QUOTE_CHARS || ql > MAX_QUOTE_CHARS) return false
    const dur = r.end_time - r.start_time
    if (dur < MIN_DURATION_SEC || dur > MAX_DURATION_SEC) return false
    // Hard floor — un-judged or low-judged clips never auto-post.
    if (r.clippability_score == null) return false
    if (r.clippability_score < SCORE_FLOOR_FOR_AUTO_PUBLISH) return false
    return true
  })

  // Rank by the judge's score (primary). Break ties on the length/duration
  // sweet-spot so "all 4s" picks the most-shareable lengths first.
  const scored = eligible.map(r => {
    const ql = (r.quote || '').length
    const dur = r.end_time - r.start_time
    const judge = r.clippability_score ?? 0
    const qScore = 1 - Math.abs(ql - 180) / 200
    const dScore = 1 - Math.abs(dur - 25) / 60
    return { row: r, score: judge * 100 + qScore + dScore }
  })
  scored.sort((a, b) => b.score - a.score)

  return {
    totalConsidered: rows.length,
    picks: scored.slice(0, limit).map(s => ({
      id: s.row.id,
      vlog_id: s.row.vlog_id,
      start_time: s.row.start_time,
      end_time: s.row.end_time,
      headline: s.row.headline,
      quote: s.row.quote,
      why_clippable: s.row.why_clippable,
      vlog_recorded_at: s.row.vlog_recorded_at,
      vlog_r2_key: s.row.vlog_r2_key,
      vlog_transcoded_r2_key: s.row.vlog_transcoded_r2_key,
    })),
  }
}

interface ShippedClip {
  productionId: string
  mp4Key: string
  durationSec: number
}

/**
 * Slice the segment, cache in R2, write the production row. Mirrors
 * the logic in /api/v2/clip-candidates/[id]/ship-as-short so a manual
 * ship and an auto-ship hit the same R2 key.
 */
async function shipClip(
  env: AutoPromoteEnv,
  operatorId: string,
  clip: PickedClip,
): Promise<ShippedClip> {
  const db = getDb(env)

  const existing = await findOne<{ id: string; output_r2_key: string | null }>(
    db,
    `SELECT id, output_r2_key FROM productions
      WHERE operator_id = ? AND source_kind = 'clip_candidate' AND source_id = ?
        AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    operatorId, clip.id,
  )
  const durationSec = Math.min(MAX_SEGMENT_SEC, clip.end_time - clip.start_time)
  const cacheKey = `${operatorId}/clip-shorts/${clip.id}.mp4`

  if (existing && existing.output_r2_key) {
    return { productionId: existing.id, mp4Key: existing.output_r2_key, durationSec }
  }

  let segmentExists = false
  try { segmentExists = !!(await getObject(env, cacheKey)) } catch {}

  if (!segmentExists) {
    const sourceKey = clip.vlog_transcoded_r2_key || clip.vlog_r2_key
    if (!sourceKey) throw new Error(`vlog ${clip.vlog_id} has no playable r2_key`)
    const sourceUrl = await presignGetUrl(env, sourceKey, 1800)
    if (!env.FFMPEG) throw new Error('FFmpeg binding not available')

    const ffResp = await env.FFMPEG.fetch('https://ffmpeg.neolog.internal/extract-video-segment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_url: sourceUrl,
        start_sec: clip.start_time,
        duration_sec: durationSec,
      }),
    })
    if (!ffResp.ok) {
      const body = (await ffResp.text()).slice(0, 500)
      throw new Error(`FFmpeg segment failed (${ffResp.status}): ${body}`)
    }
    const bytes = new Uint8Array(await ffResp.arrayBuffer())
    await putObject(env, cacheKey, bytes, { httpMetadata: { contentType: 'video/mp4' } })
  }

  let productionId: string
  if (existing) {
    productionId = existing.id
    await run(
      db,
      `UPDATE productions SET output_r2_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      cacheKey, existing.id,
    )
  } else {
    productionId = ulid()
    await run(
      db,
      `INSERT INTO productions (
          id, operator_id, production_type, source_kind, source_id, state,
          script_text, output_r2_key, output_metadata,
          prompt_version, tier, produced_at
       ) VALUES (?, ?, 'clip', 'clip_candidate', ?, 'produced',
                 NULL, ?, ?, 'clip-v1·auto-promote', 'lo_fi', CURRENT_TIMESTAMP)`,
      productionId, operatorId, clip.id, cacheKey,
      JSON.stringify({
        duration_sec: durationSec,
        start_sec: clip.start_time,
        end_sec: clip.start_time + durationSec,
        source_vlog_id: clip.vlog_id,
        headline: clip.headline,
        mime: 'video/mp4',
      }),
    )
  }

  await run(
    db,
    `UPDATE clip_candidates SET status = 'approved', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
    clip.id, operatorId,
  )

  return { productionId, mp4Key: cacheKey, durationSec }
}

/**
 * Draft a 200-char caption that wraps the verbatim quote without
 * neutering it. Voice-shape is injected so the caption sounds like
 * the operator, not a generic LLM. On error returns the bare quote.
 */
export async function draftClipCaption(
  env: AutoPromoteEnv,
  clip: PickedClip,
): Promise<string> {
  const db = getDb(env)
  const verbatim = (clip.quote || clip.headline || '').trim()
  if (!verbatim) return clip.headline || ''

  // The whole point: the caption IS the line. Just trim and ship.
  // We only call the LLM if the verbatim is too long and needs a hook
  // before it; otherwise return as-is.
  if (verbatim.length <= 240) return verbatim

  const operatorId = await findOne<{ operator_id: string }>(
    db,
    `SELECT operator_id FROM clip_candidates WHERE id = ?`,
    clip.id,
  )
  let voiceBlock = ''
  if (operatorId?.operator_id) {
    try {
      const samples = await loadVoiceSamples(db, operatorId.operator_id, 3)
      voiceBlock = formatVoiceSamples(samples)
    } catch {}
  }

  const system = `You write social-media captions in the operator's voice. Constraints:
- One caption, plain text, no hashtags, no emoji, no quote marks.
- 200 characters max.
- Distill the verbatim quote below into a tight, voice-shaped hook.
- Do NOT add a CTA, do NOT add "watch the full clip", do NOT speak about the operator in third person.
- The voice samples below show how the operator writes. Match cadence.${voiceBlock}`

  const user = `Verbatim quote (the operator's own words from the clip):
"${verbatim}"

Headline context (for tone, not for quoting): ${clip.headline}

Return one caption, under 200 chars.`

  try {
    const out = await callReasoning(env, { system, user, effort: 'low', maxTokens: 200 })
    const trimmed = (out.text || '').trim().replace(/^["']|["']$/g, '')
    if (trimmed.length > 4) return trimmed.slice(0, 280)
  } catch {}
  return verbatim.slice(0, 240)
}

/**
 * Write a posts row tied to the production. State='pending' until the
 * webhook fires successfully (then 'scheduled').
 */
async function enqueuePost(
  db: D1Database,
  operatorId: string,
  productionId: string,
  clip: PickedClip,
  caption: string,
): Promise<string> {
  const postId = ulid()
  // posts.body = caption text; parent_production_id links to the shipped
  // MP4. published_to stays NULL until the fanout vendor confirms
  // per-platform delivery (v2 callback).
  await run(
    db,
    `INSERT INTO posts (
        id, operator_id, kind, source_kind, source_id,
        parent_production_id, body, character_count, state
     ) VALUES (?, ?, 'x_post', 'production', ?, ?, ?, ?, 'pending')`,
    postId, operatorId, productionId, productionId,
    caption, caption.length,
  )
  return postId
}

/**
 * Fire the operator's social-fanout webhook with the clip payload.
 * The webhook handler (Make.com scenario, Buffer integration, the
 * operator's own worker — anything that takes JSON) does the
 * per-platform formatting and posting on its end.
 */
export async function fireFanoutWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) {
      const body = (await resp.text().catch(() => '')).slice(0, 200)
      return { ok: false, message: `webhook ${resp.status}: ${body}` }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, message: err?.message || String(err) }
  }
}
