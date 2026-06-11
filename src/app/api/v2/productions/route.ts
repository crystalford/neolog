/**
 * POST /api/v2/productions
 *
 * Production engine v1 — generate a draft from a thread OR a cluster.
 * Writes to the `productions` table (separate from `projects` which
 * holds Pack Rats-style creative containers).
 *
 * Source/type matrix:
 *   thread  → x_post (~250 chars) | micro_essay (~400 words) | clip (caption only, audio segment already exists)
 *   cluster → x_thread (4-7 posts) | article (~1200 words)
 *
 * Uses Claude Sonnet for the actual generation — quality matters here
 * and the operator-voice fidelity needs the better model. Workers AI
 * picker may come later as a 'fast draft' option.
 *
 * Request: { source_kind: 'thread' | 'cluster', source_id: string,
 *            production_type: 'x_post' | 'x_thread' | 'micro_essay' |
 *                              'article' | 'clip',
 *            model?: 'claude' | 'llama70b' }   // default: 'claude'
 * Response: { id: string, production: {…} }
 *
 * Production row starts in state='materializing'. The script_text
 * is the generated draft. Operator iterates from /production/[id].
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { callChat, type ChatMessage } from '@/lib/llm'
import { callReasoning } from '@/lib/models'
import { buildTranscriptFourGrams, isGrounded } from '@/lib/validator'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env { DB: D1Database; AI: Ai; ANTHROPIC_API_KEY: string; NEOLOG_DEV_OPERATOR_EMAIL?: string }

type SourceKind = 'thread' | 'cluster'
type ProductionType = 'x_post' | 'x_thread' | 'micro_essay' | 'article' | 'clip' | 'video_essay'
type ModelKey = 'claude' | 'llama70b' | 'kimi' | 'scout'

const VALID_FOR_THREAD = new Set<ProductionType>(['x_post', 'micro_essay', 'clip'])
// x_post on a cluster: condenses a SUBJECT (multiple recurring moments)
// into one post. Used by the Subjects screen's "Make a post" deliverable.
const VALID_FOR_CLUSTER = new Set<ProductionType>(['x_post', 'x_thread', 'article', 'video_essay'])

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => ({})) as {
    source_kind?: SourceKind
    source_id?: string
    production_type?: ProductionType
    model?: ModelKey
  }

  if (!body.source_kind || !body.source_id || !body.production_type) {
    return NextResponse.json({ error: 'source_kind, source_id, production_type required' }, { status: 400 })
  }
  if (body.source_kind === 'thread' && !VALID_FOR_THREAD.has(body.production_type)) {
    return NextResponse.json({ error: `thread sources can only produce: ${Array.from(VALID_FOR_THREAD).join(', ')}` }, { status: 400 })
  }
  if (body.source_kind === 'cluster' && !VALID_FOR_CLUSTER.has(body.production_type)) {
    return NextResponse.json({ error: `cluster sources can only produce: ${Array.from(VALID_FOR_CLUSTER).join(', ')}` }, { status: 400 })
  }

  // CLIP: no LLM. Calls the video-segment endpoint internally to slice
  // the parent vlog at the thread's span, then stores the R2 key on
  // output_r2_key. The clip is the actual moment, no caption/overlay.
  if (body.production_type === 'clip') {
    return await produceClip(req, body.source_id)
  }

  const db = getDb(env)
  // Workers AI by default — keep generation in-house unless the operator
  // explicitly upgrades to Sonnet via the picker.
  const modelKey: ModelKey = body.model ?? 'llama70b'

  // Build source context — different prompt shape per source kind.
  let sourceContext = ''
  let topicHint = ''
  // Concatenated verbatim transcript spans for the subject — used to
  // mechanically verify the generated script anchors on the operator's real
  // words (canopticon Part 8). Populated in the cluster branch.
  let verbatimCorpus = ''
  if (body.source_kind === 'thread') {
    const t = await findOne<{
      id: string; topic: string; take: string | null; abstracted_topic: string | null
      key_quotes: string | null; questions_raised: string | null; key_phrases: string | null
      register: string | null; strength: number | null
      vlog_id: string; vlog_filename: string | null; vlog_recorded_at: string | null
    }>(
      db,
      `SELECT t.id, t.topic, t.take, t.abstracted_topic, t.key_quotes, t.questions_raised,
              t.key_phrases, t.register, t.strength, t.vlog_id,
              v.original_filename AS vlog_filename, v.recorded_at AS vlog_recorded_at
         FROM threads t
         JOIN vlogs v ON v.id = t.vlog_id
        WHERE t.id = ? AND t.operator_id = ? AND t.deleted_at IS NULL`,
      body.source_id, operator.id,
    )
    if (!t) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
    topicHint = t.abstracted_topic || t.topic
    const quotes = parseJsonArr(t.key_quotes)
    const questions = parseJsonArr(t.questions_raised)
    sourceContext = `SOURCE: a single thread extracted from a vlog.
Topic: ${topicHint}
Register: ${t.register || 'observation'}
Take strength: ${t.strength ?? '?'}/5

The take (what the operator said, distilled):
${t.take || '(no take extracted)'}

Verbatim key quotes from the vlog:
${quotes.map((q, i) => `  ${i + 1}. "${q}"`).join('\n') || '  (none)'}

Open questions the operator raised:
${questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n') || '  (none)'}
`
  } else {
    // cluster
    const c = await findOne<{
      id: string; topic: string; abstracted_topic: string | null
      take: string | null; ripeness_score: number; gap_question: string | null
      form: string | null; length_magnitude: string | null
      subject_kind: string | null
      pole_a: string | null; pole_b: string | null
      pole_a_at: string | null; pole_b_at: string | null
    }>(
      db,
      `SELECT id, topic, abstracted_topic, take, ripeness_score, gap_question, form, length_magnitude,
              subject_kind, pole_a, pole_b, pole_a_at, pole_b_at
         FROM clusters
        WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      body.source_id, operator.id,
    )
    if (!c) return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
    topicHint = c.abstracted_topic || c.topic

    const threads = await findMany<{
      thread_id: string; topic: string; take: string | null; key_quotes: string | null
      strength: number | null; vlog_id: string
      span_start: number | null; span_end: number | null
      utterance_kind: string | null
    }>(
      db,
      `SELECT t.id AS thread_id, t.topic, t.take, t.key_quotes, t.strength, t.vlog_id,
              t.transcript_span_start AS span_start,
              t.transcript_span_end   AS span_end,
              t.utterance_kind        AS utterance_kind
         FROM threads t
         JOIN cluster_threads ct ON ct.thread_id = t.id
         LEFT JOIN extraction_runs er ON er.id = t.run_id
        WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
          AND (er.id IS NULL OR er.is_active = 1)
        ORDER BY COALESCE(t.strength, 3) DESC, t.extracted_at ASC
        LIMIT 8`,
      body.source_id, operator.id,
    )

    // CRITICAL — fetch the ACTUAL verbatim transcript words for each
    // thread's span. The old code fed the LLM only summaries-of-summaries
    // (take + one quote), which is why the script came out in the LLM's
    // generic voice instead of the operator's. With real spoken material
    // anchored to each thread, the LLM has something to preserve.
    const verbatimByThread = new Map<string, string>()
    for (const t of threads) {
      if (t.span_start == null || t.span_end == null) continue
      const words = await findMany<{ word: string }>(
        db,
        `SELECT word FROM transcript_words
          WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
          ORDER BY word_index ASC
          LIMIT 400`,
        t.vlog_id, t.span_start, t.span_end,
      )
      if (words.length > 0) {
        verbatimByThread.set(t.thread_id, words.map(w => w.word).join(' '))
      }
    }
    verbatimCorpus = Array.from(verbatimByThread.values()).join('\n')
    const insights = await findMany<{
      kind: string; body: string; source_label: string | null; source_url: string | null
    }>(
      db,
      `SELECT kind, body, source_label, source_url
         FROM cluster_insights
        WHERE cluster_id = ?
        ORDER BY created_at DESC
        LIMIT 30`,
      body.source_id,
    )
    const operatorNotes = insights.filter(i => i.source_label === 'operator')
    const cultivateInsights = insights.filter(i => i.source_label !== 'operator' || !i.source_label)

    // Tension/evolution subjects get a different opening frame — the
    // contradiction or change-of-mind IS the spine of the script, not a
    // recurring theme. The poles + their dates set the shape.
    const kindHeader = (() => {
      if (c.subject_kind === 'tension') {
        return `THIS SUBJECT IS A TENSION — the operator has held OPPOSING positions on this idea across time. The script's spine is the contradiction itself, lived honestly. Don't resolve it artificially.\n` +
          (c.pole_a ? `Position A (${c.pole_a_at ?? '?'}): ${c.pole_a}\n` : '') +
          (c.pole_b ? `Position B (${c.pole_b_at ?? '?'}): ${c.pole_b}\n` : '') +
          `Build the script so it surfaces and SITS WITH the tension — no false reconciliation, no "the real answer is somewhere in the middle" pap.\n\n`
      }
      if (c.subject_kind === 'evolution') {
        return `THIS SUBJECT IS AN EVOLUTION — the operator's view on this matured / shifted in one direction over time. The script's spine is the change itself, traced honestly.\n` +
          (c.pole_a ? `Earlier (${c.pole_a_at ?? '?'}): ${c.pole_a}\n` : '') +
          (c.pole_b ? `Later (${c.pole_b_at ?? '?'}): ${c.pole_b}\n` : '') +
          `Open in the earlier position (without condescending to it); walk what shifted; land on the matured view.\n\n`
      }
      if (c.subject_kind === 'open_loop') {
        return `THIS SUBJECT IS AN OPEN LOOP — an unresolved question the operator keeps returning to. The script doesn't answer it. The script sits inside the question and lets the audience feel why it stays open.\n\n`
      }
      return ''
    })()
    sourceContext = `SOURCE: a cluster of moments where the operator returns to one subject.
Subject: ${topicHint}
${c.gap_question ? `Open question: ${c.gap_question}\n` : ''}
${kindHeader}═══════════════════════════════════════════════════════════════
PRIMARY MATERIAL — verbatim transcript spans. THIS IS THE OPERATOR'S
ACTUAL VOICE. The script you write must be built FROM these spans, not
in addition to them. Quote, weave, compress — never paraphrase. If a
beat doesn't have an anchor sentence drawn from these spans, drop it.
═══════════════════════════════════════════════════════════════

${threads.map((t, i) => {
  const span = verbatimByThread.get(t.thread_id)
  const quotes = parseJsonArr(t.key_quotes)
  const kind = t.utterance_kind || 'observation'
  return `[MOMENT ${i + 1}] kind: ${kind} · ${t.topic}\n` +
    (span ? `Verbatim span:\n  "${span.trim().replace(/\s+/g, ' ').slice(0, 1800)}"\n`
          : `(no transcript span — use the key quotes only)\n`) +
    (quotes.length > 0 ? `Key quotes: ${quotes.slice(0, 3).map(q => `"${q}"`).join(' · ')}\n` : '')
}).join('\n')}

ARC GUIDANCE (use the kind label on each moment to compose a real essay arc, not a flat list):
  · open a claim moment as the position
  · ground it in a story moment (something that actually happened)
  · land on an open_question moment (the unresolved tension) — that's the strongest close
  · observation/feeling moments are colour beats, not load-bearing structure
  · intention moments can close if no open_question is present
  If kind is missing for a moment, infer it from the span itself.

${operatorNotes.length > 0 ? `Operator's own framing of this subject (use sparingly — these are notes, not voice):
${operatorNotes.map((n, i) => `  ${i + 1}. ${n.body}`).join('\n')}
` : ''}${cultivateInsights.length > 0 ? `External references (cite if useful, but the operator's verbatim spans come first):
${cultivateInsights.map((n, i) => `  ${i + 1}. [${n.kind}${n.source_label ? ' · ' + n.source_label : ''}] ${n.body}${n.source_url ? ` (${n.source_url})` : ''}`).join('\n')}
` : ''}`
  }

  // Per-type system prompt + max-tokens budget.
  const promptByType: Record<ProductionType, { system: string; maxTokens: number }> = {
    x_post: {
      maxTokens: 400,
      system: `You are drafting a single X post in the operator's own voice. The operator already said the substance — your job is to compress it into ONE post (≤ 270 characters), preserving their phrasing, hesitations, and contradictions. Do not soften, sanitize, or sermonize. Output ONLY the post text. No hashtags unless the operator already used them. No leading "Just thinking…" or framing — start with the substance.`,
    },
    x_thread: {
      maxTokens: 1200,
      system: `You are drafting an X thread (4-7 posts) in the operator's own voice. The substance is already there in the cluster's threads — your job is to braid them into a sequenced thread. Each post ≤ 270 chars. Posts numbered 1/N. Use the operator's verbatim phrasing where possible. Open with the strongest single take; build; end on the gap question if there is one (turned into a statement, not a question for the reader). Output ONLY the posts, separated by --- on its own line between each. No hashtags unless already used.`,
    },
    micro_essay: {
      maxTokens: 1500,
      system: `You are drafting a micro-essay (300-450 words) in the operator's own voice. The thread is the seed. Build around their take + verbatim quotes; preserve the rhythm of how they actually talk. No throat-clearing intro. Open with the take or a verbatim quote. No bullet points. Plain prose. End on a sharp closing line — not a CTA, not a summary, a landing.`,
    },
    article: {
      maxTokens: 4000,
      system: `You are drafting a long-form article (900-1400 words) in the operator's own voice, building from a cluster of takes. Structure: open with the operator's strongest verbatim take, develop the position across 3-4 sections, use the cluster's verbatim quotes as anchors, end on the cluster's gap question turned into a clarifying statement. Preserve the operator's hesitations and qualifications — do not sermonize. No subheads unless the structure genuinely needs them. Markdown allowed for emphasis, but sparse.`,
    },
    clip: {
      // Unused — clip type bails out to produceClip() before reaching
      // this map. Kept here for type completeness.
      maxTokens: 200,
      system: ``,
    },
    video_essay: {
      maxTokens: 6000,
      system: `You are drafting a video essay voiceover script (~10-15 minutes spoken, ~1500-2200 words) BUILT FROM the operator's verbatim transcript spans. The operator will record their voice reading this script.

═══════════════════════════════════════════════════════════════
HARD RULES — do not violate. Failures here ruin the script.
═══════════════════════════════════════════════════════════════

1. ANCHOR EVERY BEAT IN VERBATIM. Every beat must contain at least one sentence that is a verbatim 4+ word substring from the PRIMARY MATERIAL (the transcript spans). If you can't anchor a beat on verbatim, drop it. Building beats around general thoughts that aren't actually in the source = failure.

2. NEVER include "framing" language in the script. The script is what the operator SPEAKS — second person ("you keep circling…") is for UI surfaces, not voiceover. If you see phrases like "You keep circling this:" anywhere in the source material, do NOT carry them into the script. The operator does not refer to themselves in the second person.

3. NEVER open with throat-clearing transcript noise — "we should have…", "I just said it all", "yeah I guess…" Those are pre-talk warmups, not substance. Find a moment in the verbatim where the operator says something with shape, and open there.

4. NEVER write generic essay filler: "I mean, that's what we need, right?", "And that's what people are looking for", "Let me tell you something", "Now, here's the thing." If a sentence sounds like it could appear in any LLM-generated YouTube essay, cut it.

5. The operator's hesitations, contradictions, and rough edges stay. Don't smooth them into clean prose. Roughness is signal.

═══════════════════════════════════════════════════════════════
STRUCTURE
═══════════════════════════════════════════════════════════════

Break the script into BEATS. Each beat = one continuous spoken thought, 30-90 seconds when read (75-225 words). Output beats separated by lines containing ONLY === on their own line.

Each beat starts with a short directive header on its own line in brackets: [BEAT: <one-line title>]. Then the spoken prose. No stage directions inside the prose. No "in this next beat" meta-commentary.

OPEN with a verbatim sentence (or compressed-from-verbatim sentence) that puts the subject's specific tension on the table. Not an abstract statement of theme — the operator's actual angle.

DEVELOP across 6-10 beats. Each beat takes one moment from the verbatim, anchors on it, and adds the minimum surrounding prose needed to make it land. Don't over-write. Better five tight beats than ten padded ones.

CLOSE on the operator's sharpest verbatim moment from the source — or the open question turned into a statement they could plausibly say. Never "thanks for watching", never a CTA, never a moralizing summary.

Output ONLY the script. No explanation, no preamble.`,
    },
  }

  const cfg = promptByType[body.production_type]
  const userPrompt = `${sourceContext}

Now draft the ${body.production_type.replace(/_/g, ' ')}. Voice rules:
- The operator's verbatim phrasing comes first; don't paraphrase if you can use their actual words.
- Hesitations, contradictions, and "I think" stay. Sanitizing them flattens the operator.
- No throat-clearing. No "In this piece I'll argue…" openings.
- No moralizing summary at the end.
`

  // Reasoning effort dial (canopticon Part 16): the long-form synthesis types
  // get high effort; the short compressions get medium.
  const effort: 'high' | 'medium' =
    (body.production_type === 'video_essay' || body.production_type === 'article') ? 'high' : 'medium'

  // generate() runs one draft. Claude stays the paid opt-in (via callChat);
  // everything else routes through callReasoning → gpt-oss-120b with a Llama
  // 70B fallback. Returns the text + which model actually answered.
  const generate = async (userMsg: string): Promise<{ text: string; model: string }> => {
    if (modelKey === 'claude') {
      const resp = await callChat(env, {
        model: modelKey,
        system: cfg.system,
        messages: [{ role: 'user', content: userMsg } as ChatMessage],
        maxTokens: cfg.maxTokens,
        temperature: 0.7,
      })
      return { text: (resp.text || '').trim(), model: resp.model || modelKey }
    }
    const r = await callReasoning(env, {
      system: cfg.system,
      user: userMsg,
      effort,
      maxTokens: cfg.maxTokens,
    })
    return { text: r.text.trim(), model: r.fellBack ? `${r.model} (fallback)` : r.model }
  }

  let scriptText = ''
  let modelUsed: string = modelKey
  let groundingRatio: number | null = null
  try {
    const first = await generate(userPrompt)
    scriptText = first.text
    modelUsed = first.model

    // (canopticon Part 8) Mechanical verification — for video essays, check
    // the script actually anchors on the operator's verbatim words. Beats
    // with zero 4-gram overlap with the transcript spans are LLM filler.
    // If too many drift, retry ONCE with a hardened reminder. Flag, never
    // gate (operator approves).
    if (body.production_type === 'video_essay' && verbatimCorpus.length > 40) {
      const fourGrams = buildTranscriptFourGrams(verbatimCorpus)
      const ratioOf = (script: string): number => {
        const beats = script.split(/^\s*=+\s*$/m).map(b => b.trim()).filter(Boolean)
        if (beats.length === 0) return 0
        const anchored = beats.filter(b => isGrounded(b.replace(/^\s*\[BEAT:[^\]]*\]/i, ''), fourGrams)).length
        return anchored / beats.length
      }
      groundingRatio = ratioOf(scriptText)
      if (groundingRatio < 0.5) {
        const harderPrompt = userPrompt +
          `\n\n⚠️ CRITICAL: your previous attempt drifted off the source. EVERY beat MUST contain a literal 4+ word run copied from the PRIMARY MATERIAL above. Do not write a single sentence that isn't anchored in the operator's actual transcribed words. Rewrite.`
        try {
          const retry = await generate(harderPrompt)
          const retryRatio = ratioOf(retry.text)
          if (retry.text && retryRatio >= groundingRatio) {
            scriptText = retry.text
            modelUsed = retry.model
            groundingRatio = retryRatio
          }
        } catch { /* keep the first draft if the retry errors */ }
      }
    }
  } catch (err: any) {
    return NextResponse.json({
      error: `LLM call failed: ${err?.message || String(err)}`,
    }, { status: 502 })
  }

  if (!scriptText) {
    return NextResponse.json({ error: 'LLM returned empty draft' }, { status: 502 })
  }

  // Insert the production row.
  const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  await db.prepare(
    `INSERT INTO productions (
        id, operator_id, production_type, source_kind, source_id, state,
        script_text, prompt_version, tier
     ) VALUES (?, ?, ?, ?, ?, 'materializing', ?, ?, 'lo_fi')`,
  ).bind(
    id, operator.id, body.production_type, body.source_kind, body.source_id,
    scriptText,
    `production-v1·${modelUsed}${groundingRatio != null ? `·grounded${Math.round(groundingRatio * 100)}%` : ''}`,
  ).run()

  // For video_essay, parse beats from the script ("=== " separator
  // with optional "[BEAT: title]" headers) and write each into
  // production_beats. Operator will record voiceover per beat.
  if (body.production_type === 'video_essay') {
    const beats = parseBeats(scriptText)
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i]
      const beatId = `beat_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`
      try {
        await db.prepare(
          `INSERT INTO production_beats (id, production_id, beat_index, beat_text, cue)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(beatId, id, i, b.text, b.title || null).run()
      } catch (err: any) {
        console.warn(`[production beats] failed to insert beat ${i}: ${err?.message}`)
      }
    }
  }

  return NextResponse.json({
    id,
    production: {
      id,
      production_type: body.production_type,
      source_kind: body.source_kind,
      source_id: body.source_id,
      state: 'materializing',
      script_text: scriptText,
      model: modelUsed,
      topic: topicHint,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

function parseJsonArr(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {}
  return []
}

/**
 * Parse a video_essay script into beats. The LLM is asked to emit
 *   [BEAT: <title>]
 *   <prose>
 *   ===
 *   [BEAT: <title>]
 *   <prose>
 *
 * Robust to: missing title brackets, single === or multiple, leading/
 * trailing whitespace, empty beats.
 */
function parseBeats(script: string): { title: string | null; text: string }[] {
  const chunks = script.split(/^\s*=+\s*$/m).map(c => c.trim()).filter(Boolean)
  return chunks.map(chunk => {
    const m = chunk.match(/^\s*\[\s*BEAT\s*:\s*(.+?)\s*\]\s*\n([\s\S]+)$/i)
    if (m) return { title: m[1].trim(), text: m[2].trim() }
    return { title: null, text: chunk.trim() }
  }).filter(b => b.text.length > 0)
}

/**
 * Materialize a clip production. Calls the video-segment endpoint
 * (which calls FFmpeg, uploads to R2, returns the cached URL +
 * r2_key), then writes a productions row pointing at the R2 object.
 * No LLM involved — clip is raw footage, no caption / overlay.
 */
async function produceClip(req: NextRequest, threadId: string) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  // Call the video-segment endpoint via internal fetch. We forward
  // the same auth cookie so requireOperator() on the other side passes.
  const segResp = await fetch(
    `${new URL(req.url).origin}/api/v2/threads/${encodeURIComponent(threadId)}/video-segment`,
    {
      method: 'POST',
      headers: { 'Cookie': req.headers.get('cookie') || '' },
    },
  )
  const segData: any = await segResp.json().catch(() => ({}))
  if (!segResp.ok) {
    return NextResponse.json({ error: segData?.error || `Clip slice failed (${segResp.status})` }, { status: segResp.status })
  }

  const db = getDb(env)
  // Look up the thread for topic context (so the production card on
  // /productions has something to show).
  const t = await findOne<{ topic: string; abstracted_topic: string | null }>(
    db,
    `SELECT topic, abstracted_topic FROM threads
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    threadId, operator.id,
  )
  const topicHint = (t?.abstracted_topic || t?.topic || 'Clip') as string

  const id = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  await db.prepare(
    `INSERT INTO productions (
        id, operator_id, production_type, source_kind, source_id, state,
        script_text, output_r2_key, output_metadata,
        prompt_version, tier
     ) VALUES (?, ?, 'clip', 'thread', ?, 'produced',
               NULL, ?, ?, 'clip-v1·ffmpeg', 'lo_fi')`,
  ).bind(
    id, operator.id, threadId, segData.r2_key,
    JSON.stringify({
      duration_sec: segData.duration_sec,
      start_sec: segData.start_sec,
      mime: 'video/mp4',
    }),
  ).run()

  return NextResponse.json({
    id,
    production: {
      id,
      production_type: 'clip',
      source_kind: 'thread',
      source_id: threadId,
      state: 'produced',
      script_text: null,
      output_r2_key: segData.r2_key,
      output_url: segData.url,
      duration_sec: segData.duration_sec,
      topic: topicHint,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
