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
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env { DB: D1Database; AI: Ai; ANTHROPIC_API_KEY: string; NEOLOG_DEV_OPERATOR_EMAIL?: string }

type SourceKind = 'thread' | 'cluster'
type ProductionType = 'x_post' | 'x_thread' | 'micro_essay' | 'article' | 'clip'
type ModelKey = 'claude' | 'llama70b' | 'kimi' | 'scout'

const VALID_FOR_THREAD = new Set<ProductionType>(['x_post', 'micro_essay', 'clip'])
const VALID_FOR_CLUSTER = new Set<ProductionType>(['x_thread', 'article'])

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

  const db = getDb(env)
  const modelKey: ModelKey = body.model ?? 'claude'

  // Build source context — different prompt shape per source kind.
  let sourceContext = ''
  let topicHint = ''
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
    }>(
      db,
      `SELECT id, topic, abstracted_topic, take, ripeness_score, gap_question, form, length_magnitude
         FROM clusters
        WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      body.source_id, operator.id,
    )
    if (!c) return NextResponse.json({ error: 'Cluster not found' }, { status: 404 })
    topicHint = c.abstracted_topic || c.topic

    const threads = await findMany<{
      topic: string; take: string | null; key_quotes: string | null; strength: number | null
    }>(
      db,
      `SELECT t.topic, t.take, t.key_quotes, t.strength
         FROM threads t
         JOIN cluster_threads ct ON ct.thread_id = t.id
         JOIN extraction_runs er ON er.id = t.run_id AND er.is_active = 1
        WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
        ORDER BY t.strength DESC, t.extracted_at ASC
        LIMIT 20`,
      body.source_id, operator.id,
    )
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

    sourceContext = `SOURCE: a cluster — a position braided across multiple vlogs.
Topic: ${topicHint}
Ripeness: ${Math.round(c.ripeness_score)}/100
${c.take ? `Cluster take: ${c.take}\n` : ''}${c.gap_question ? `Gap question: ${c.gap_question}\n` : ''}
Member threads (operator's verbatim takes across ${threads.length} moments):
${threads.map((t, i) => {
  const quotes = parseJsonArr(t.key_quotes)
  const q = quotes.length > 0 ? `\n     Quote: "${quotes[0]}"` : ''
  return `  ${i + 1}. [${t.strength ?? '?'}/5] ${t.take || t.topic}${q}`
}).join('\n')}

${operatorNotes.length > 0 ? `Operator's own framing of this cluster:
${operatorNotes.map((n, i) => `  ${i + 1}. ${n.body}`).join('\n')}
` : ''}${cultivateInsights.length > 0 ? `Surfaced insights (system + external references):
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
      maxTokens: 200,
      system: `You are drafting a short caption (≤ 200 characters) for an audio clip extracted from the operator's vlog. The clip plays the operator's verbatim words; your caption frames it for someone scrolling past. One sentence. Pull from their actual take but punchier. No emoji. No hashtags.`,
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

  let scriptText = ''
  let modelUsed: string = modelKey
  try {
    const resp = await callChat(env, {
      model: modelKey,
      system: cfg.system,
      messages: [{ role: 'user', content: userPrompt } as ChatMessage],
      maxTokens: cfg.maxTokens,
      temperature: 0.7,
    })
    scriptText = (resp.text || '').trim()
    modelUsed = resp.model || modelKey
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
    scriptText, `production-v1·${modelUsed}`,
  ).run()

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
