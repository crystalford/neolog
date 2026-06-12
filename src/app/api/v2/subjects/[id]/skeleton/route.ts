/**
 * Reasoning-skeleton flow for a subject (Phase 4).
 *
 *   POST /api/v2/subjects/[id]/skeleton          → propose a BEAT skeleton
 *   POST /api/v2/subjects/[id]/skeleton { lock: true, beats: [...] }
 *                                                → write the full script
 *                                                  FROM the locked skeleton
 *
 * The skeleton is a small JSON object: an ordered list of beats, each with
 * a one-line directive (kind + title + the single moment-index it anchors
 * on) — NOT prose. Operator reorders / regenerates the skeleton until it
 * matches the argument they want. Then the lock-and-write step runs the
 * full prose generator against the locked skeleton; the model can no longer
 * invent the structure, only fill it in. This is canopticon Part 9.6
 * (reasoning lock) applied to neolog's script flow.
 *
 * Same locked skeleton can later fan out to other deliverables (article, X
 * thread) without re-deciding the argument shape.
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { callReasoning } from '@/lib/models'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: Ai
  ANTHROPIC_API_KEY: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

interface SkeletonBeat {
  index: number
  title: string
  kind: string         // 'open' | 'claim' | 'story' | 'turn' | 'tension' | 'land' | 'open_question'
  moment_index: number // which input moment this beat anchors on
  one_line: string     // a one-line directive for what this beat does — NOT prose
}

const SKELETON_SYSTEM = `You are designing the REASONING SKELETON for a short video essay (~10-15 min spoken). Not the prose — the spine of the argument.

You receive a list of MOMENTS (verbatim spans from the creator's recordings, with kind labels). Decide which moments to use and in what order so the essay has a real ARC, not a flat collage.

Output an ordered list of BEATS. Each beat has:
  - title: 3-6 words naming this beat
  - kind: one of "open" | "claim" | "story" | "turn" | "tension" | "land" | "open_question"
  - moment_index: which input moment this beat will be built FROM (the moment whose verbatim span anchors the beat)
  - one_line: ONE sentence telling the prose writer what this beat does (NOT the prose itself; an instruction). E.g. "Open on the moment of noticing the pattern" or "Turn — surface the contradiction with the May 12 take" or "Land in the unresolved question without resolving it."

RULES:
- Aim for 5-9 beats. Tight beats land. Padded beats drift.
- Use each moment at most once. Skip moments that don't earn a beat.
- If the subject is a TENSION, the spine is the contradiction — at least one beat MUST be kind="tension".
- If the subject is an EVOLUTION, beats trace the shift; use kind="turn" for the pivot beat.
- If the subject is an OPEN LOOP, end on kind="open_question" — do not resolve.
- Open should anchor on the operator's sharpest verbatim, not on a meta-frame.

Return ONLY this JSON:
{"beats":[{"title":"...","kind":"open|claim|story|turn|tension|land|open_question","moment_index":0,"one_line":"..."}]}`

const PROSE_FROM_SKELETON_SYSTEM = `You are writing the full video essay voiceover prose FROM a locked reasoning skeleton. The skeleton is settled — your job is to fill in each beat with the operator's verbatim spoken material.

RULES (non-negotiable):
1. Use the skeleton's beats in order. Do not add, remove, or reorder them. Each output beat corresponds to ONE skeleton beat.
2. Each beat's prose MUST anchor on the verbatim span of its referenced MOMENT. If the moment's span gives you a 4+ word verbatim run, that run goes IN the prose. The minimum surrounding prose is added only to make it land.
3. Each beat starts with: [BEAT: <skeleton title>] on its own line, then the prose.
4. Beats are separated by lines containing ONLY ===.
5. NEVER copy the skeleton's "one_line" directive into the prose — it's an instruction to you, not for the audience.
6. NEVER include "framing" language ("You keep circling this:") — that's UI text, not voiceover.
7. NEVER write generic essay filler ("I mean, that's what we need, right?", "And that's what people are looking for"). If it could fit any LLM-generated essay, cut it.
8. Operator's hesitations, contradictions, rough edges stay. Roughness is signal.

Output ONLY the script. No preamble.`

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const { id: subjectId } = await ctx.params
  const body = await req.json().catch(() => ({})) as {
    lock?: boolean
    beats?: SkeletonBeat[]
    production_id?: string
  }

  const db = getDb(env)
  const subject = await findOne<{
    id: string; topic: string; subject_kind: string | null
    pole_a: string | null; pole_b: string | null
    pole_a_at: string | null; pole_b_at: string | null
  }>(
    db,
    `SELECT id, topic, subject_kind, pole_a, pole_b, pole_a_at, pole_b_at
       FROM clusters WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    subjectId, operator.id,
  )
  if (!subject) return NextResponse.json({ error: 'subject not found' }, { status: 404 })

  // Gather member moments with their verbatim spans + kinds — same shape the
  // script generator uses, kept here so skeleton+prose see the same material.
  const threads = await findMany<{
    thread_id: string; vlog_id: string; topic: string; take: string | null
    strength: number | null; utterance_kind: string | null
    span_start: number | null; span_end: number | null
    recorded_at: string | null
  }>(
    db,
    `SELECT t.id AS thread_id, t.vlog_id, t.topic, t.take, t.strength,
            t.utterance_kind, t.transcript_span_start AS span_start,
            t.transcript_span_end AS span_end, v.recorded_at
       FROM threads t
       JOIN cluster_threads ct ON ct.thread_id = t.id
       JOIN vlogs v ON v.id = t.vlog_id
       LEFT JOIN extraction_runs er ON er.id = t.run_id
      WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
        AND (er.id IS NULL OR er.is_active = 1)
      ORDER BY COALESCE(t.strength, 3) DESC, v.recorded_at DESC
      LIMIT 10`,
    subjectId, operator.id,
  )
  if (threads.length === 0) {
    return NextResponse.json({ error: 'subject has no moments to build from' }, { status: 400 })
  }

  // Verbatim spans by thread id.
  const spans: Map<string, string> = new Map()
  for (const t of threads) {
    if (t.span_start == null || t.span_end == null) continue
    const words = await findMany<{ word: string }>(
      db,
      `SELECT word FROM transcript_words
        WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
        ORDER BY word_index ASC LIMIT 350`,
      t.vlog_id, t.span_start, t.span_end,
    )
    if (words.length > 0) spans.set(t.thread_id, words.map(w => w.word).join(' '))
  }

  // ── 1) PROPOSE the skeleton ───────────────────────────────────────────
  if (!body.lock) {
    const inputList = threads.map((t, i) =>
      `${i}. [${t.recorded_at ?? '?'} · kind=${t.utterance_kind ?? 'observation'}] ${t.topic}\n   verbatim: "${(spans.get(t.thread_id) ?? '').slice(0, 600)}"`,
    ).join('\n\n')

    const kindHeader = subject.subject_kind === 'tension'
      ? `This subject is a TENSION between two poles:\n  A (${subject.pole_a_at ?? '?'}): ${subject.pole_a ?? ''}\n  B (${subject.pole_b_at ?? '?'}): ${subject.pole_b ?? ''}\n`
      : subject.subject_kind === 'evolution'
        ? `This subject is an EVOLUTION:\n  earlier (${subject.pole_a_at ?? '?'}): ${subject.pole_a ?? ''}\n  later (${subject.pole_b_at ?? '?'}): ${subject.pole_b ?? ''}\n`
        : subject.subject_kind === 'open_loop'
          ? `This subject is an OPEN LOOP — an unresolved question. The skeleton must not resolve it.\n`
          : ''

    const userPrompt = `Subject: ${subject.topic}\n${kindHeader}\nMoments:\n\n${inputList}\n\nDesign the beat skeleton.`
    try {
      const r = await callReasoning(env, { system: SKELETON_SYSTEM, user: userPrompt, effort: 'high', maxTokens: 2048 })
      const parsed = parseSkeletonJson(r.text)
      // Project into our SkeletonBeat shape with sanity-bounded indexes.
      const beats: SkeletonBeat[] = parsed.map((b, i) => ({
        index: i,
        title: b.title.slice(0, 80),
        kind: b.kind,
        moment_index: Math.max(0, Math.min(threads.length - 1, b.moment_index)),
        one_line: b.one_line.slice(0, 240),
      }))
      return NextResponse.json({
        ok: true,
        subject_id: subjectId,
        moments: threads.map((t, i) => ({
          index: i, topic: t.topic, recorded_at: t.recorded_at,
          kind: t.utterance_kind, verbatim_preview: (spans.get(t.thread_id) ?? '').slice(0, 240),
        })),
        beats,
        model: r.fellBack ? `${r.model} (fallback)` : r.model,
      }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (err: any) {
      return NextResponse.json({ error: `skeleton LLM failed: ${err?.message || err}` }, { status: 502 })
    }
  }

  // ── 2) LOCK the skeleton + write the prose ──────────────────────────────
  if (!Array.isArray(body.beats) || body.beats.length === 0) {
    return NextResponse.json({ error: 'beats[] required when lock=true' }, { status: 400 })
  }
  const lockedBeats = body.beats.map((b, i) => ({
    index: i,
    title: String(b.title ?? '').slice(0, 80),
    kind: String(b.kind ?? 'claim'),
    moment_index: Number.isInteger(b.moment_index) ? b.moment_index : 0,
    one_line: String(b.one_line ?? '').slice(0, 240),
  }))

  const beatBlock = lockedBeats.map(b => {
    const t = threads[b.moment_index] ?? threads[0]
    const span = spans.get(t.thread_id) ?? ''
    return `[BEAT ${b.index + 1}: ${b.title}] kind=${b.kind}\n  Directive: ${b.one_line}\n  Verbatim to anchor in: "${span.slice(0, 1400)}"`
  }).join('\n\n')

  // Voice-shape anchoring: pull register-varied strong takes from across
  // the operator's corpus to lock voice. Even for cluster sources where
  // beats already have their own verbatim anchors, this teaches the model
  // the operator's connective tissue cadence (the words between the
  // anchors) so the prose sounds like one person.
  const { loadVoiceSamples, formatVoiceSamples } = await import('@/lib/voice-shape')
  const voiceSamples = await loadVoiceSamples(db, operator.id, 4)
  const voiceBlock = formatVoiceSamples(voiceSamples)

  const userPrompt = `Locked skeleton — write the prose, beat by beat, in order. Anchor each beat in its verbatim. Output the full script with === separators between beats.\n\n${beatBlock}${voiceBlock}`

  let scriptText = ''
  let modelUsed = ''
  try {
    const r = await callReasoning(env, {
      system: PROSE_FROM_SKELETON_SYSTEM,
      user: userPrompt,
      effort: 'high',
      maxTokens: 6000,
    })
    scriptText = r.text.trim()
    modelUsed = r.fellBack ? `${r.model} (fallback)` : r.model
  } catch (err: any) {
    return NextResponse.json({ error: `prose LLM failed: ${err?.message || err}` }, { status: 502 })
  }
  if (!scriptText) {
    return NextResponse.json({ error: 'prose LLM returned empty' }, { status: 502 })
  }

  // Reuse the productions table; create a new production (or update the
  // existing one if production_id was supplied).
  const skeletonJson = JSON.stringify({ beats: lockedBeats })
  let productionId = body.production_id
  if (productionId) {
    await db.prepare(
      `UPDATE productions
          SET script_text = ?, reasoning_skeleton_json = ?, skeleton_locked = 1,
              prompt_version = ?, state = 'materializing', state_changed_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND operator_id = ?`,
    ).bind(scriptText, skeletonJson, `production-skeleton-v1·${modelUsed}`, productionId, operator.id).run()
  } else {
    productionId = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    await db.prepare(
      `INSERT INTO productions (
          id, operator_id, production_type, source_kind, source_id, state,
          script_text, prompt_version, tier, reasoning_skeleton_json, skeleton_locked
       ) VALUES (?, ?, 'video_essay', 'cluster', ?, 'materializing', ?, ?, 'lo_fi', ?, 1)`,
    ).bind(productionId, operator.id, subjectId, scriptText, `production-skeleton-v1·${modelUsed}`, skeletonJson).run()
  }

  // Parse beats into production_beats.
  const beats = scriptText.split(/^\s*=+\s*$/m).map(c => c.trim()).filter(Boolean)
  // Wipe old beats on regenerate.
  await db.prepare(`DELETE FROM production_beats WHERE production_id = ?`).bind(productionId).run()
  for (let i = 0; i < beats.length; i++) {
    const chunk = beats[i]
    const m = chunk.match(/^\s*\[\s*BEAT[^\]]*\]\s*\n([\s\S]+)$/i)
    const text = m ? m[1].trim() : chunk
    const title = lockedBeats[i]?.title ?? null
    const beatId = `beat_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`
    await db.prepare(
      `INSERT INTO production_beats (id, production_id, beat_index, beat_text, cue)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(beatId, productionId, i, text, title).run()
  }

  return NextResponse.json({
    ok: true, production_id: productionId, model: modelUsed, beats_written: beats.length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

function parseSkeletonJson(text: string): SkeletonBeat[] {
  let t = text.trim()
  if (t.startsWith('```json')) t = t.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  else if (t.startsWith('```')) t = t.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  const firstBrace = t.indexOf('{')
  const lastBrace = t.lastIndexOf('}')
  if (firstBrace > 0 && lastBrace > firstBrace) t = t.slice(firstBrace, lastBrace + 1)
  const obj = JSON.parse(t)
  const beats = Array.isArray(obj?.beats) ? obj.beats : []
  return beats
    .filter((b: any) => b && typeof b.title === 'string' && typeof b.kind === 'string')
    .map((b: any, i: number) => ({
      index: i,
      title: String(b.title).trim(),
      kind: String(b.kind).trim(),
      moment_index: Number.isInteger(b.moment_index) ? b.moment_index : 0,
      one_line: String(b.one_line ?? '').trim(),
    }))
}
