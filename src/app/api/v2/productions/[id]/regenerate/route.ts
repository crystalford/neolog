/**
 * POST /api/v2/productions/[id]/regenerate
 *
 * Re-runs the production engine for an existing production. Pulls
 * source_kind / source_id / production_type from the row, calls the
 * LLM with a fresh prompt + (possibly) a new model, updates
 * script_text in place and bumps script_version. For video_essay,
 * wipes existing production_beats and re-parses from the new script.
 *
 * Body: { model?: 'claude' | 'llama70b' | 'kimi' | 'scout' }
 * Defaults to llama70b (in-house) per project rule.
 *
 * Clip type is NOT re-generatable through here (no LLM involved —
 * the clip is just an FFmpeg slice that already exists in R2).
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb, findOne, findMany } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { callChat, type ChatMessage } from '@/lib/llm'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env { DB: D1Database; AI: Ai; ANTHROPIC_API_KEY: string; NEOLOG_DEV_OPERATOR_EMAIL?: string }
type ModelKey = 'claude' | 'llama70b' | 'kimi' | 'scout'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const env = getRequestContext().env as unknown as Env
  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  const body = await req.json().catch(() => ({})) as { model?: ModelKey }
  const modelKey: ModelKey = body.model ?? 'llama70b'

  const db = getDb(env)
  const prod = await findOne<{
    id: string; source_kind: string; source_id: string
    production_type: string; script_version: number
  }>(
    db,
    `SELECT id, source_kind, source_id, production_type, script_version
       FROM productions
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
    params.id, operator.id,
  )
  if (!prod) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (prod.production_type === 'clip') {
    return NextResponse.json({
      error: 'Clip is an FFmpeg slice — not regeneratable via this endpoint. Delete and re-Produce if you want a fresh slice.',
    }, { status: 400 })
  }

  // Rebuild source context (same logic as POST /api/v2/productions).
  let sourceContext = ''
  if (prod.source_kind === 'thread') {
    const t = await findOne<any>(db,
      `SELECT t.topic, t.take, t.abstracted_topic, t.key_quotes, t.questions_raised,
              t.register, t.strength
         FROM threads t
        WHERE t.id = ? AND t.operator_id = ? AND t.deleted_at IS NULL`,
      prod.source_id, operator.id,
    )
    if (!t) return NextResponse.json({ error: 'Source thread missing — was it deleted?' }, { status: 410 })
    const quotes = parseJsonArr(t.key_quotes)
    const questions = parseJsonArr(t.questions_raised)
    sourceContext = `SOURCE: a single thread extracted from a vlog.
Topic: ${t.abstracted_topic || t.topic}
Register: ${t.register || 'observation'}
Take strength: ${t.strength ?? '?'}/5

The take:
${t.take || '(no take extracted)'}

Verbatim key quotes:
${quotes.map((q, i) => `  ${i + 1}. "${q}"`).join('\n') || '  (none)'}

Open questions:
${questions.map((q, i) => `  ${i + 1}. ${q}`).join('\n') || '  (none)'}
`
  } else {
    const c = await findOne<any>(db,
      `SELECT topic, abstracted_topic, take, ripeness_score, gap_question
         FROM clusters
        WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      prod.source_id, operator.id,
    )
    if (!c) return NextResponse.json({ error: 'Source cluster missing' }, { status: 410 })
    const threads = await findMany<any>(db,
      `SELECT t.topic, t.take, t.key_quotes, t.strength
         FROM threads t
         JOIN cluster_threads ct ON ct.thread_id = t.id
         JOIN extraction_runs er ON er.id = t.run_id AND er.is_active = 1
        WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
        ORDER BY t.strength DESC, t.extracted_at ASC LIMIT 20`,
      prod.source_id, operator.id,
    )
    const insights = await findMany<any>(db,
      `SELECT kind, body, source_label, source_url FROM cluster_insights
        WHERE cluster_id = ? ORDER BY created_at DESC LIMIT 30`,
      prod.source_id,
    )
    const opNotes = insights.filter((i: any) => i.source_label === 'operator')
    const cultivate = insights.filter((i: any) => i.source_label !== 'operator' || !i.source_label)
    sourceContext = `SOURCE: a cluster.
Topic: ${c.abstracted_topic || c.topic}
Ripeness: ${Math.round(c.ripeness_score)}/100
${c.take ? `Cluster take: ${c.take}\n` : ''}${c.gap_question ? `Gap question: ${c.gap_question}\n` : ''}
Member threads (${threads.length}):
${threads.map((t: any, i: number) => {
  const qs = parseJsonArr(t.key_quotes)
  const q = qs.length > 0 ? `\n     Quote: "${qs[0]}"` : ''
  return `  ${i + 1}. [${t.strength ?? '?'}/5] ${t.take || t.topic}${q}`
}).join('\n')}

${opNotes.length > 0 ? `Operator's framing:
${opNotes.map((n: any, i: number) => `  ${i + 1}. ${n.body}`).join('\n')}
` : ''}${cultivate.length > 0 ? `Surfaced insights:
${cultivate.map((n: any, i: number) => `  ${i + 1}. [${n.kind}${n.source_label ? ' · ' + n.source_label : ''}] ${n.body}${n.source_url ? ` (${n.source_url})` : ''}`).join('\n')}
` : ''}`
  }

  const promptByType: Record<string, { system: string; maxTokens: number }> = {
    x_post: { maxTokens: 400,
      system: `You are drafting a single X post in the operator's own voice. ≤ 270 chars. Output ONLY the post text. No hashtags unless already used.` },
    x_thread: { maxTokens: 1200,
      system: `You are drafting an X thread (4-7 posts) in the operator's own voice. Each ≤ 270 chars. Numbered 1/N. Separated by --- on its own line.` },
    micro_essay: { maxTokens: 1500,
      system: `You are drafting a micro-essay (300-450 words) in the operator's own voice. No throat-clearing. Plain prose. Sharp landing.` },
    article: { maxTokens: 4000,
      system: `You are drafting a long-form article (900-1400 words) in the operator's own voice. Open with the strongest verbatim take. Develop across 3-4 sections. End with the gap question turned into a clarifying statement.` },
    video_essay: { maxTokens: 6000,
      system: `You are drafting a video essay script (~10-15 minutes spoken, ~1500-2200 words) in the operator's own voice. Break into BEATS separated by '===' on its own line. Each beat 30-90 seconds spoken (75-225 words), prefixed by [BEAT: <title>] on its own line. No stage directions inside beats. Preserve verbatim phrasing. Open with the strongest take. End on the gap question turned into a clarifying statement.` },
  }

  const cfg = promptByType[prod.production_type]
  if (!cfg) return NextResponse.json({ error: `No prompt for type ${prod.production_type}` }, { status: 400 })

  let scriptText = ''
  let modelUsed: string = modelKey
  try {
    const resp = await callChat(env, {
      model: modelKey,
      system: cfg.system,
      messages: [{ role: 'user', content: `${sourceContext}\n\nNow draft the ${prod.production_type.replace(/_/g, ' ')}. The operator's verbatim phrasing comes first. Hesitations and contradictions stay. No throat-clearing. No moralizing summary.` } as ChatMessage],
      maxTokens: cfg.maxTokens,
      temperature: 0.75,
    })
    scriptText = (resp.text || '').trim()
    modelUsed = resp.model || modelKey
  } catch (err: any) {
    return NextResponse.json({ error: `LLM call failed: ${err?.message || String(err)}` }, { status: 502 })
  }
  if (!scriptText) return NextResponse.json({ error: 'LLM returned empty draft' }, { status: 502 })

  // Update the row in place; bump script_version.
  await db.prepare(
    `UPDATE productions
        SET script_text = ?, script_version = ?, prompt_version = ?,
            state = 'materializing', state_changed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND operator_id = ?`,
  ).bind(scriptText, prod.script_version + 1, `production-v1·${modelUsed}·regen`, params.id, operator.id).run()

  // Video essay: wipe + re-insert beats. Existing recordings (audio_r2_key)
  // are LOST — the new beats won't match the old indices. That's the
  // tradeoff of a regenerate; operator should be sure.
  if (prod.production_type === 'video_essay') {
    await db.prepare(`DELETE FROM production_beats WHERE production_id = ?`).bind(params.id).run()
    const beats = parseBeats(scriptText)
    for (let i = 0; i < beats.length; i++) {
      const beatId = `beat_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`
      try {
        await db.prepare(
          `INSERT INTO production_beats (id, production_id, beat_index, beat_text, cue)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(beatId, params.id, i, beats[i].text, beats[i].title || null).run()
      } catch {}
    }
  }

  return NextResponse.json({
    ok: true, script_version: prod.script_version + 1, model: modelUsed,
  })
}

function parseJsonArr(raw: string | null): string[] {
  if (!raw) return []
  try { const p = JSON.parse(raw); if (Array.isArray(p)) return p.map(String) } catch {}
  return []
}
function parseBeats(script: string): { title: string | null; text: string }[] {
  const chunks = script.split(/^\s*=+\s*$/m).map(c => c.trim()).filter(Boolean)
  return chunks.map(chunk => {
    const m = chunk.match(/^\s*\[\s*BEAT\s*:\s*(.+?)\s*\]\s*\n([\s\S]+)$/i)
    if (m) return { title: m[1].trim(), text: m[2].trim() }
    return { title: null, text: chunk.trim() }
  }).filter(b => b.text.length > 0)
}
