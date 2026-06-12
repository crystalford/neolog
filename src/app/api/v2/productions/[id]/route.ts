/**
 * GET /api/v2/productions/[id]    — single production + source context
 * PATCH /api/v2/productions/[id]  — operator edits script_text / state
 * DELETE /api/v2/productions/[id] — soft delete
 *
 * Reads from the `productions` table (script_text, state machine).
 * Distinct from /api/v2/projects/[id] which serves Pack Rats-style
 * creative containers.
 *
 * GET response includes source context (thread or cluster) so the
 * draft page can show what's being drafted FROM in the rail.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { presignGetUrl, type R2Env } from '@/lib/r2'
import type { D1Database } from '@cloudflare/workers-types'

interface Env extends R2Env { DB: D1Database; NEOLOG_DEV_OPERATOR_EMAIL?: string }

type ProductionRow = {
  id: string; operator_id: string
  production_type: string; source_kind: string; source_id: string
  state: string; state_changed_at: string
  script_text: string | null; script_version: number
  voice_profile_id: string | null
  form: string | null; length_magnitude: string | null
  prompt_version: string | null
  visibility: string
  published_to: string | null; engagement: string | null
  produced_at: string | null
  output_r2_key: string | null; output_metadata: string | null
  render_status: string | null; render_started_at: string | null
  created_at: string; updated_at: string
}
type BeatRow = {
  id: string; beat_index: number; beat_text: string; cue: string | null
  audio_r2_key: string | null; take_number: number; recorded_at: string | null
  visual_treatment: string | null
  broll_image_r2_key: string | null
  broll_video_r2_key: string | null
  broll_prompt: string | null
  broll_status: string | null
  synth_audio_r2_key: string | null
  synth_voice_id: string | null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)

  const prod = await findOne<ProductionRow>(
    db,
    `SELECT id, operator_id, production_type, source_kind, source_id, state, state_changed_at,
            script_text, script_version, voice_profile_id, form, length_magnitude,
            prompt_version, visibility, published_to, engagement, produced_at,
            output_r2_key, output_metadata, render_status, render_started_at,
            created_at, updated_at
       FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!prod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Presign the output if it's a clip (or any other type with an
  // r2_key — e.g., a future final-mix MP4).
  let output_url: string | null = null
  if (prod.output_r2_key) {
    try { output_url = await presignGetUrl(env, prod.output_r2_key, 4 * 3600) }
    catch { /* leave null */ }
  }

  // Load beats for video_essay productions. Each beat has its own
  // index, text, optional cue (title), and optional audio_r2_key
  // once the operator records voiceover.
  let beats: (BeatRow & {
    audio_url: string | null
    synth_audio_url: string | null
    broll_image_url: string | null
    broll_video_url: string | null
  })[] = []
  if (prod.production_type === 'video_essay') {
    try {
      const rows = await findMany<BeatRow>(
        db,
        `SELECT id, beat_index, beat_text, cue, audio_r2_key, take_number, recorded_at, visual_treatment,
                broll_image_r2_key, broll_video_r2_key, broll_prompt, broll_status,
                synth_audio_r2_key, synth_voice_id
           FROM production_beats
          WHERE production_id = ?
          ORDER BY beat_index ASC`,
        params.id,
      )
      beats = await Promise.all(rows.map(async b => {
        let audio_url: string | null = null
        let synth_audio_url: string | null = null
        let broll_image_url: string | null = null
        let broll_video_url: string | null = null
        if (b.audio_r2_key) {
          try { audio_url = await presignGetUrl(env, b.audio_r2_key, 4 * 3600) } catch {}
        }
        if (b.synth_audio_r2_key) {
          try { synth_audio_url = await presignGetUrl(env, b.synth_audio_r2_key, 4 * 3600) } catch {}
        }
        if (b.broll_image_r2_key) {
          try { broll_image_url = await presignGetUrl(env, b.broll_image_r2_key, 4 * 3600) } catch {}
        }
        if (b.broll_video_r2_key) {
          try { broll_video_url = await presignGetUrl(env, b.broll_video_r2_key, 4 * 3600) } catch {}
        }
        return { ...b, audio_url, synth_audio_url, broll_image_url, broll_video_url }
      }))
    } catch {}
  }

  // Source context — what we drafted FROM.
  let source: any = null
  try {
    if (prod.source_kind === 'thread') {
      source = await findOne<any>(
        db,
        `SELECT t.id, t.topic, t.take, t.abstracted_topic, t.strength, t.transcript_span_start,
                t.transcript_span_end, t.vlog_id,
                v.original_filename AS vlog_filename
           FROM threads t
           JOIN vlogs v ON v.id = t.vlog_id
          WHERE t.id = ? AND t.operator_id = ?`,
        prod.source_id, operator.id,
      )
    } else if (prod.source_kind === 'cluster') {
      const c = await findOne<any>(
        db,
        `SELECT id, topic, abstracted_topic, take, ripeness_score, state
           FROM clusters
          WHERE id = ? AND operator_id = ?`,
        prod.source_id, operator.id,
      )
      if (c) {
        const threads = await findMany<any>(
          db,
          `SELECT t.id, t.topic, t.take, t.strength
             FROM threads t
             JOIN cluster_threads ct ON ct.thread_id = t.id
            WHERE ct.cluster_id = ? AND t.operator_id = ?
            ORDER BY t.strength DESC LIMIT 10`,
          prod.source_id, operator.id,
        )
        source = { ...c, threads }
      }
    }
  } catch {}

  return NextResponse.json({
    production: { ...prod, output_url },
    source,
    beats,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  const patch = await req.json().catch(() => ({})) as {
    script_text?: string
    state?: string
    visibility?: 'private' | 'public'
  }

  const existing = await findOne<{ id: string; script_version: number; script_text: string | null }>(
    db,
    `SELECT id, script_version, script_text FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fields: string[] = []
  const values: any[] = []
  if (typeof patch.script_text === 'string') {
    fields.push('script_text = ?', 'script_version = ?')
    values.push(patch.script_text, existing.script_version + 1)
  }
  if (patch.state && ['materializing','script_ready','recording','producing','produced','published','archived'].includes(patch.state)) {
    fields.push('state = ?', 'state_changed_at = CURRENT_TIMESTAMP')
    values.push(patch.state)
    if (patch.state === 'produced' || patch.state === 'published') {
      fields.push('produced_at = COALESCE(produced_at, CURRENT_TIMESTAMP)')
    }
  }
  if (patch.visibility === 'public' || patch.visibility === 'private') {
    fields.push('visibility = ?')
    values.push(patch.visibility)
  }
  if (fields.length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  fields.push('updated_at = CURRENT_TIMESTAMP')
  values.push(params.id, operator.id)

  await db.prepare(
    `UPDATE productions SET ${fields.join(', ')} WHERE id = ? AND operator_id = ?`,
  ).bind(...values).run()

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }
  const db = getDb(env)
  await db.prepare(
    `UPDATE productions SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
  ).bind(params.id, operator.id).run()
  return NextResponse.json({ ok: true })
}
