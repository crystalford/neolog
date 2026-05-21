/**
 * POST /api/v2/admin/cultivate-clusters
 *
 * The intelligence pass. Given a cluster of threads, asks an LLM to:
 *   1. Name the concept this pattern matches in the literature (any
 *      field — behavioral economics, philosophy, design, software …)
 *   2. Suggest an adjacent thinker / framing that pairs with it.
 *   3. Cross-reference the operator's OTHER clusters that likely connect.
 *   4. Surface a gap question to push the thinking further.
 *
 * In-house first: defaults to Llama 3.3 70B on Workers AI. Kimi K2.6
 * is an alternate (also Workers AI). Sonnet is opt-in per-cluster
 * escalation only — never auto-triggered.
 *
 * Writes results to:
 *   - cluster_insights (one row per insight kind)
 *   - bounce_runs (tracks each invocation for provenance + side-by-side)
 *   - surfaced_cards (subtype='adjacent_insight', appears on Timeline)
 *
 * Body:
 *   {
 *     cluster_id?: string,        // omit + cluster_ids omit = no-op
 *     cluster_ids?: string[],     // bulk; up to 10 per request
 *     model?: 'llama70b' | 'kimi' | 'sonnet',  // override default
 *     dry_run?: boolean,          // preview prompt + LLM output, no writes
 *   }
 *
 * Response:
 *   { ok: true, cultivated: [{ cluster_id, bounce_run_id, insights_created, model, surfaced_id? }],
 *     errors?: { cluster_id, message }[] }
 */

export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { getDb } from '@/lib/d1'
import { requireOperator, UnauthenticatedError } from '@/lib/access'
import { getSetting, SETTING_KEYS } from '@/lib/operator-settings'
import { callClaude } from '@/lib/anthropic'
import { ulid } from '@/lib/ulid'
import type { D1Database, Ai } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  AI: Ai
  ANTHROPIC_API_KEY: string
  NEOLOG_DEV_OPERATOR_EMAIL?: string
}

type ModelKey = 'llama70b' | 'kimi' | 'sonnet'

const MODEL_IDS: Record<ModelKey, { provider: 'workers_ai' | 'claude'; id: string }> = {
  llama70b: { provider: 'workers_ai', id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  kimi:     { provider: 'workers_ai', id: '@cf/moonshotai/kimi-k2.6' },
  sonnet:   { provider: 'claude',     id: 'claude-sonnet-4-6' },
}

const CULTIVATE_PROMPT_VERSION = 'cultivate-v1'

// Inline prompt seed. Once we have a prompts table workflow we can
// migrate this to db/seed.sql + load by (name='cluster_cultivate',
// is_active=1). For now keep it co-located with the consumer so the
// prompt and output schema stay in sync as we iterate.
const SYSTEM_PROMPT = `You are a domain-spanning research assistant working on the operator's personal life graph. They record vlogs; the system extracts "threads" (atomic takes, voice-grounded). A "cluster" is 3+ threads circling the same idea across multiple vlogs.

Your job: given a cluster, find what's REALLY going on under the surface topic.

1. NAME THE PATTERN. The operator's emergent thinking often maps to a named concept from some field — behavioral economics, philosophy, music theory, design discourse, software architecture, communications, sociology, neuroscience. Identify the most apt named concept this cluster is circling. Give the field. If the operator's pattern is genuinely original (no named concept fits well), say so — return null. Do not invent matches.

2. ADJACENT THINKERS. Whose existing work / framing pairs with this cluster? Bring in 1-2 specific people + a one-line description of their relevant framing + why it pairs. Real people, real framings. Empty array if nothing comes to mind — never invent.

3. CROSS-REFS. The user payload includes a short list of the operator's OTHER clusters. Do any pair with THIS cluster's concept? Return their cluster_id + one-line why. Empty array if no obvious pair.

4. GAP QUESTION. What's the next question this cluster opens up? The thing that, if the operator riffed on it next, would push the pattern further. One question only.

VOICE: speak directly to the operator (second person). No hedging. No "perhaps" / "might" / "could be." If you don't know, return null/[].

OUTPUT: valid JSON matching the schema in the user message. No prose, no markdown fences.`

interface CultivateOutput {
  concept: null | {
    name: string
    field: string
    summary_line: string
    confidence: 'high' | 'medium' | 'low'
  }
  adjacent: { thinker: string; framing: string; why_pairs: string }[]
  cross_refs: { cluster_id: string; why_pairs: string }[]
  gap_question: string | null
}

export async function POST(req: NextRequest) {
  const env = getRequestContext().env as unknown as Env

  let operator
  try { operator = await requireOperator(req, env) }
  catch (e) {
    if (e instanceof UnauthenticatedError) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    throw e
  }

  let body: { cluster_id?: string; cluster_ids?: string[]; model?: ModelKey; dry_run?: boolean } = {}
  try { body = await req.json() } catch {}

  const idsRaw: string[] = body.cluster_id
    ? [body.cluster_id]
    : Array.isArray(body.cluster_ids) ? body.cluster_ids : []
  const ids = idsRaw.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, 10)
  if (ids.length === 0) return NextResponse.json({ error: 'cluster_id or cluster_ids required' }, { status: 400 })

  const db = getDb(env)

  // Resolve model: explicit > operator setting > default 'llama70b' (in-house).
  let model: ModelKey
  if (body.model && body.model in MODEL_IDS) {
    model = body.model
  } else {
    const pref = await getSetting(db, operator.id, SETTING_KEYS.CULTIVATE_DEFAULT_MODEL)
    model = (pref === 'llama70b' || pref === 'kimi' || pref === 'sonnet') ? pref : 'llama70b'
  }
  const modelRoute = MODEL_IDS[model]

  // Load a brief summary of the operator's OTHER clusters once, reused
  // across all cluster_ids in this request. Cap at 30 so the prompt
  // stays small (~1.5K tokens at typical topic lengths).
  const otherClusters = (await db.prepare(
    `SELECT id, topic, abstracted_topic, ripeness_score,
            (SELECT COUNT(*) FROM cluster_threads WHERE cluster_id = clusters.id) AS thread_count
       FROM clusters
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY ripeness_score DESC, thread_count DESC
      LIMIT 30`,
  ).bind(operator.id).all<{
    id: string
    topic: string
    abstracted_topic: string | null
    ripeness_score: number | null
    thread_count: number
  }>()).results ?? []

  const cultivated: any[] = []
  const errors: { cluster_id: string; message: string }[] = []

  for (const cluster_id of ids) {
    try {
      // Load the cluster + its threads.
      const cluster = await db.prepare(
        `SELECT id, topic, abstracted_topic, take
           FROM clusters
          WHERE id = ? AND operator_id = ? AND deleted_at IS NULL`,
      ).bind(cluster_id, operator.id).first<{
        id: string; topic: string; abstracted_topic: string | null; take: string | null
      }>()
      if (!cluster) {
        errors.push({ cluster_id, message: 'not found' })
        continue
      }
      const threadsRes = await db.prepare(
        `SELECT t.id, t.topic, t.take, t.key_quotes, t.register, t.strength,
                t.abstracted_topic, t.vlog_id, t.extracted_at
           FROM threads t
           JOIN cluster_threads ct ON ct.thread_id = t.id
          WHERE ct.cluster_id = ? AND t.operator_id = ? AND t.deleted_at IS NULL
          ORDER BY COALESCE(t.strength, 3) DESC, t.extracted_at ASC`,
      ).bind(cluster_id, operator.id).all<{
        id: string; topic: string; take: string | null; key_quotes: string | null
        register: string | null; strength: number | null; abstracted_topic: string | null
        vlog_id: string; extracted_at: string
      }>()
      const threads = threadsRes.results ?? []
      if (threads.length < 2) {
        errors.push({ cluster_id, message: `cluster has only ${threads.length} threads; need >= 2` })
        continue
      }

      // Build the user payload. The prompt asks for cross-refs against
      // the operator's other clusters — pass that list (excluding the
      // current cluster) inline so the LLM can pattern-match against it.
      const userPayload = {
        cluster: {
          topic: cluster.topic,
          abstracted_topic: cluster.abstracted_topic,
          representative_take: cluster.take,
          thread_count: threads.length,
        },
        threads: threads.map(t => ({
          topic: t.topic,
          take: t.take,
          key_quotes: t.key_quotes ? safeJsonArray(t.key_quotes) : [],
          register: t.register,
          strength: t.strength ?? 3,
        })),
        other_clusters: otherClusters
          .filter(c => c.id !== cluster_id)
          .map(c => ({
            cluster_id: c.id,
            topic: c.topic,
            abstracted_topic: c.abstracted_topic,
            thread_count: c.thread_count,
          })),
        output_schema: {
          concept: { name: 'string|null', field: 'string', summary_line: 'string', confidence: 'high|medium|low' },
          adjacent: '[{ thinker, framing, why_pairs }]',
          cross_refs: '[{ cluster_id, why_pairs }]',
          gap_question: 'string|null',
        },
      }
      const userMsg = JSON.stringify(userPayload, null, 2)

      // ── LLM call ────────────────────────────────────────────────────
      let llmText = ''
      let inputTokens = 0
      let outputTokens = 0
      if (modelRoute.provider === 'claude') {
        const r = await callClaude(env, {
          model: modelRoute.id,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
          maxTokens: 2000,
          expectJson: true,
        })
        llmText = r.text
        inputTokens = r.inputTokens
        outputTokens = r.outputTokens
      } else {
        // Workers AI. Llama 3.3 70B and Kimi both speak OpenAI-style
        // messages; both return either choices[0].message.content or
        // a .response field. Handle both.
        const result: any = await env.AI.run(modelRoute.id as any, {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMsg + '\n\nReturn ONLY valid JSON. No prose, no markdown fences.' },
          ],
          max_tokens: 2000,
        })
        llmText = String(
          result?.choices?.[0]?.message?.content ??
          result?.response ??
          ''
        )
        inputTokens = result?.usage?.prompt_tokens ?? 0
        outputTokens = result?.usage?.completion_tokens ?? 0
      }
      llmText = stripJsonFences(llmText)

      let parsed: CultivateOutput
      try { parsed = JSON.parse(llmText) as CultivateOutput }
      catch (parseErr: any) {
        errors.push({ cluster_id, message: `LLM returned non-JSON (model=${modelRoute.id}): ${String(parseErr?.message || parseErr).slice(0, 200)}` })
        continue
      }

      if (body.dry_run) {
        cultivated.push({ cluster_id, dry_run: true, model: modelRoute.id, raw: parsed, tokens: { in: inputTokens, out: outputTokens } })
        continue
      }

      // ── Persist ─────────────────────────────────────────────────────
      const bounce_run_id = ulid()
      await db.prepare(
        `INSERT INTO bounce_runs
           (id, cluster_id, mode, prompt_version, started_at, completed_at, provider)
         VALUES (?, ?, 'default', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
      ).bind(bounce_run_id, cluster_id, CULTIVATE_PROMPT_VERSION, `${modelRoute.provider}:${modelRoute.id}`).run()

      const insightInserts: { kind: string; title: string | null; body: string }[] = []
      if (parsed.concept && parsed.concept.name) {
        insightInserts.push({
          kind: 'name',
          title: parsed.concept.name,
          body: `**${parsed.concept.name}** (${parsed.concept.field}) — ${parsed.concept.summary_line}${parsed.concept.confidence ? ` _(confidence: ${parsed.concept.confidence})_` : ''}`,
        })
      }
      for (const adj of (parsed.adjacent ?? []).slice(0, 4)) {
        if (!adj?.thinker) continue
        insightInserts.push({
          kind: 'parallel',
          title: adj.thinker,
          body: `**${adj.thinker}** — "${adj.framing}". ${adj.why_pairs}`,
        })
      }
      for (const xr of (parsed.cross_refs ?? []).slice(0, 6)) {
        if (!xr?.cluster_id) continue
        // Validate cluster_id belongs to operator before inserting.
        const target = otherClusters.find(c => c.id === xr.cluster_id)
        if (!target) continue
        insightInserts.push({
          kind: 'parallel',
          title: target.topic,
          body: `Cross-ref: cluster "${target.topic}" — ${xr.why_pairs}`,
        })
      }
      if (parsed.gap_question) {
        insightInserts.push({
          kind: 'gap_question',
          title: null,
          body: parsed.gap_question,
        })
      }

      for (const ins of insightInserts) {
        try {
          await db.prepare(
            `INSERT INTO cluster_insights
               (id, cluster_id, kind, title, body, bounce_run_id, surfaced, surfaced_at)
             VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
          ).bind(ulid(), cluster_id, ins.kind, ins.title, ins.body, bounce_run_id).run()
        } catch (insErr: any) {
          // Don't abort the whole cluster on a single insight failure —
          // the bounce_run + other insights are still useful.
          console.warn(`[cultivate] insight insert failed for ${cluster_id}:`, insErr?.message || insErr)
        }
      }

      // Surface a single card on Timeline IF we got a concept name.
      // Cards without a recognized concept aren't worth interrupting
      // the operator's feed for.
      let surfaced_id: string | null = null
      if (parsed.concept?.name) {
        surfaced_id = ulid()
        const adj0 = parsed.adjacent?.[0]
        const cardBody =
          `**${parsed.concept.name}** — ${parsed.concept.field}. ` +
          (adj0 ? `Adjacent: ${adj0.thinker}'s "${adj0.framing}" pairs with this. ` : '') +
          (parsed.gap_question ? `Gap: ${parsed.gap_question}` : '')
        try {
          await db.prepare(
            `INSERT INTO surfaced_cards
               (id, operator_id, subtype, body, body_html, topic_color, refs)
             VALUES (?, ?, 'adjacent_insight', ?, ?, ?, ?)`,
          ).bind(
            surfaced_id, operator.id, cardBody, cardBody, null,
            JSON.stringify({ cluster_id, bounce_run_id, model: modelRoute.id }),
          ).run()
        } catch (cardErr: any) {
          console.warn(`[cultivate] surfaced_card insert failed for ${cluster_id}:`, cardErr?.message || cardErr)
          surfaced_id = null
        }
      }

      cultivated.push({
        cluster_id,
        bounce_run_id,
        insights_created: insightInserts.length,
        surfaced_id,
        model: modelRoute.id,
        provider: modelRoute.provider,
        concept_name: parsed.concept?.name ?? null,
        tokens: { in: inputTokens, out: outputTokens },
      })
    } catch (err: any) {
      errors.push({ cluster_id, message: String(err?.message || err).slice(0, 500) })
    }
  }

  return NextResponse.json({
    ok: true,
    cultivated,
    errors: errors.length ? errors : undefined,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// ── helpers ─────────────────────────────────────────────────────────

function stripJsonFences(s: string): string {
  let t = s.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  return t.trim()
}

function safeJsonArray(s: string): string[] {
  try {
    const parsed = JSON.parse(s)
    if (Array.isArray(parsed)) return parsed.map(x => typeof x === 'string' ? x : (x?.text ?? '')).filter(Boolean)
  } catch {}
  return []
}
