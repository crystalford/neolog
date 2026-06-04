/**
 * The Librarian — turns the mess of extracted threads into a small set of
 * named SUBJECTS the operator keeps returning to.
 *
 * This replaces the old string-match clustering (build-clusters), which only
 * grouped threads whose `abstracted_topic` label matched as a literal string.
 * The librarian groups by MEANING and, crucially, identifies the underlying
 * CONCEPT using the model's world knowledge — naming it correctly even when
 * the operator never used the term ("you keep describing the principal-agent
 * problem"). That naming is the whole point: a good video essay is built
 * around a named idea, and now the operator gets the name for free.
 *
 * Output is written into the existing `clusters` table (subject_source =
 * 'librarian') so the production → video-essay flow works unchanged. Each
 * run replaces the prior librarian subjects; manually-made clusters
 * (subject_source IS NULL) are left alone.
 *
 * Model: Llama 3.3 70B on Workers AI (the real in-house default). Swap to
 * Claude by funding the Anthropic key + passing a model override — the
 * concept-identification is exactly the kind of task that benefits from a
 * stronger model, so this is the natural first place to spend if desired.
 */

import { ulid } from './ulid'
import type { D1Database } from '@cloudflare/workers-types'

const LLAMA_70B = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'

// How many distinct topic-keys we hand the model in one pass. Recurring
// subjects rise to the top by thread frequency, so the long tail of
// one-offs (which aren't "subjects you keep circling" anyway) is dropped.
const MAX_TOPIC_KEYS = 160
// Minimum threads for a subject to surface. "Keep circling" needs recurrence.
const MIN_THREADS_PER_SUBJECT = 2

export interface LibrarianEnv {
  AI: { run: (model: string, args: unknown) => Promise<any> }
}

interface TopicKey {
  key: string          // the subject_key string (abstracted_topic or topic)
  thread_count: number
  vlog_count: number
  avg_strength: number
  sample_take: string
  sample_quote: string
}

interface LlmSubject {
  name: string
  framing: string
  named_by_system: boolean
  confidence: number
  member_indexes: number[]
}

export interface BuildSubjectsResult {
  ok: boolean
  topic_keys_considered: number
  subjects_proposed: number
  subjects_written: number
  subjects: { id: string; name: string; thread_count: number; vlog_count: number; named_by_system: boolean }[]
  model: string
  error?: string
}

const SYSTEM_PROMPT = `You are a sharp editor and librarian organizing a creator's spoken ideas.

The creator records themselves talking freely. We've already extracted hundreds of small "topics" from those recordings. Your job is to step back and find the SUBJECTS they keep returning to — the handful of real ideas worth building a video essay around.

For each subject you identify:

1. NAME THE REAL CONCEPT. Use your knowledge. If the creator keeps describing something that has a real name — a named idea in psychology, economics, philosophy, politics, technology, culture — NAME IT, even if they never used the term. ("The principal-agent problem." "Theory of mind." "Loss aversion." "The bystander effect." "Rent-seeking.") This is the most valuable thing you do: give them the word for the thing they've been circling. If they clearly already name it themselves, use their framing.

2. WRITE A ONE-LINE FRAMING. Plain language, second person, the shape: "You keep circling this: <what it is, when it shows up>." Make it feel like a mirror held up to their thinking.

3. Set named_by_system to true if YOU supplied the concept name (they were describing it without the term), false if they were already using the concept's name.

4. confidence: 0.0–1.0, how sure you are this is a real, coherent subject (not a grab-bag).

5. member_indexes: the indexes (from the input list) of the topic-entries that belong to this subject. Group by MEANING — "the for-you page" and "recommendation algorithms" belong together even though the words differ.

RULES:
- Aim for 6–16 subjects. Quality over coverage. It's fine to leave one-off topics ungrouped — don't force everything in.
- A subject must have genuine recurrence or substance. Don't invent connective tissue that isn't there.
- Don't merge unrelated things just to make a bigger pile.

Return ONLY valid JSON, no prose, no markdown fences:
{"subjects":[{"name":"...","framing":"...","named_by_system":true,"confidence":0.0,"member_indexes":[0,1]}]}`

export async function buildSubjects(
  db: D1Database,
  operatorId: string,
  env: LibrarianEnv,
): Promise<BuildSubjectsResult> {
  // ── 1. Aggregate threads into distinct subject_keys ────────────────────
  const agg = await db.prepare(
    `SELECT COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic) AS subject_key,
            COUNT(*)                AS thread_count,
            COUNT(DISTINCT vlog_id) AS vlog_count,
            AVG(COALESCE(strength, 3)) AS avg_strength
       FROM threads
      WHERE operator_id = ? AND deleted_at IS NULL
        AND COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM extraction_runs er WHERE er.id = threads.run_id AND er.is_active = 0)
      GROUP BY LOWER(COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic))
      ORDER BY thread_count DESC, vlog_count DESC
      LIMIT ?`,
  ).bind(operatorId, MAX_TOPIC_KEYS).all<{
    subject_key: string; thread_count: number; vlog_count: number; avg_strength: number
  }>()

  const aggRows = agg.results ?? []
  if (aggRows.length === 0) {
    return { ok: true, topic_keys_considered: 0, subjects_proposed: 0, subjects_written: 0, subjects: [], model: LLAMA_70B }
  }

  // One representative take + quote per subject_key (strongest thread).
  const repRes = await db.prepare(
    `SELECT subject_key, take, key_quotes FROM (
       SELECT COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic) AS subject_key,
              take, key_quotes,
              ROW_NUMBER() OVER (
                PARTITION BY LOWER(COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic))
                ORDER BY COALESCE(strength, 3) DESC, extracted_at ASC
              ) AS rn
         FROM threads
        WHERE operator_id = ? AND deleted_at IS NULL
          AND COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic) IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM extraction_runs er WHERE er.id = threads.run_id AND er.is_active = 0)
     ) WHERE rn = 1`,
  ).bind(operatorId).all<{ subject_key: string; take: string | null; key_quotes: string | null }>()

  const repByKey = new Map<string, { take: string; quote: string }>()
  for (const r of repRes.results ?? []) {
    repByKey.set(r.subject_key.toLowerCase().trim(), {
      take: (r.take ?? '').slice(0, 240),
      quote: firstQuote(r.key_quotes),
    })
  }

  const topicKeys: TopicKey[] = aggRows.map(r => {
    const rep = repByKey.get(r.subject_key.toLowerCase().trim())
    return {
      key: r.subject_key,
      thread_count: r.thread_count,
      vlog_count: r.vlog_count,
      avg_strength: r.avg_strength,
      sample_take: rep?.take ?? '',
      sample_quote: rep?.quote ?? '',
    }
  })

  // ── 2. Ask the librarian to organize + name ────────────────────────────
  const inputList = topicKeys.map((t, i) =>
    `${i}. "${t.key}" — ${t.thread_count} thread${t.thread_count === 1 ? '' : 's'}/${t.vlog_count} vlog${t.vlog_count === 1 ? '' : 's'}` +
    (t.sample_take ? ` — e.g. "${t.sample_take.replace(/\s+/g, ' ').trim()}"` : ''),
  ).join('\n')

  const userPrompt = `Here are the topic-entries extracted from the creator's recordings, most frequent first. Each line is: index. "topic" — counts — sample of what they said.\n\n${inputList}\n\nOrganize these into the subjects the creator keeps returning to. Name the real concept behind each. Return ONLY the JSON.`

  let llmSubjects: LlmSubject[]
  try {
    const res = await env.AI.run(LLAMA_70B, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 4096,
    })
    const raw = res?.response ?? res?.text ?? res?.choices?.[0]?.message?.content ?? ''
    const parsed = parseSubjectsJson(String(raw))
    llmSubjects = parsed
  } catch (err: any) {
    return {
      ok: false, topic_keys_considered: topicKeys.length, subjects_proposed: 0,
      subjects_written: 0, subjects: [], model: LLAMA_70B,
      error: `librarian LLM failed: ${err?.message || err}`.slice(0, 500),
    }
  }

  // ── 3. Resolve each subject's member threads ───────────────────────────
  // Clear prior librarian subjects (cluster_threads cascades on cluster delete).
  await db.prepare(
    `DELETE FROM clusters WHERE operator_id = ? AND subject_source = 'librarian'`,
  ).bind(operatorId).run()

  const written: BuildSubjectsResult['subjects'] = []

  for (const s of llmSubjects) {
    const memberKeys = (s.member_indexes ?? [])
      .map(i => topicKeys[i]?.key)
      .filter((k): k is string => typeof k === 'string')
    if (memberKeys.length === 0) continue

    // Gather all threads whose subject_key matches any member key (case-insensitive).
    const lowered = memberKeys.map(k => k.toLowerCase().trim())
    const placeholders = lowered.map(() => '?').join(',')
    const threadsRes = await db.prepare(
      `SELECT id, vlog_id, take, key_quotes, strength,
              LOWER(COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic)) AS subject_key
         FROM threads
        WHERE operator_id = ? AND deleted_at IS NULL
          AND LOWER(COALESCE(NULLIF(TRIM(abstracted_topic), ''), topic)) IN (${placeholders})
          AND NOT EXISTS (SELECT 1 FROM extraction_runs er WHERE er.id = threads.run_id AND er.is_active = 0)
        ORDER BY COALESCE(strength, 3) DESC, extracted_at ASC`,
    ).bind(operatorId, ...lowered).all<{
      id: string; vlog_id: string; take: string | null; key_quotes: string | null; strength: number | null; subject_key: string
    }>()

    const threads = threadsRes.results ?? []
    if (threads.length < MIN_THREADS_PER_SUBJECT) continue

    const vlogIds = new Set(threads.map(t => t.vlog_id))
    const avgStrength = threads.reduce((sum, t) => sum + (t.strength ?? 3), 0) / threads.length
    const ripeness = Math.min(100, Math.round(
      threads.length * 12 + (vlogIds.size - 1) * 8 + avgStrength * 3,
    ))
    const repQuote = firstQuote(threads[0]?.key_quotes) || (threads[0]?.take ?? '').slice(0, 200)
    const state = ripeness >= 60 ? 'ready' : 'forming'

    const clusterId = ulid()
    await db.prepare(
      `INSERT INTO clusters
         (id, operator_id, topic, take, abstracted_topic, state, ripeness_score,
          framing, concept_confidence, named_by_system, representative_quote, subject_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'librarian')`,
    ).bind(
      clusterId, operatorId,
      s.name.slice(0, 200),
      (s.framing ?? '').slice(0, 500),
      s.name.toLowerCase().slice(0, 200),
      state, ripeness,
      (s.framing ?? '').slice(0, 500),
      clamp01(s.confidence),
      s.named_by_system ? 1 : 0,
      repQuote.slice(0, 500),
    ).run()

    // Write cluster_threads (strongest = core, rest supporting).
    for (let i = 0; i < threads.length; i++) {
      const role = i === 0 ? 'core' : 'supporting'
      await db.prepare(
        `INSERT OR IGNORE INTO cluster_threads (cluster_id, thread_id, role) VALUES (?, ?, ?)`,
      ).bind(clusterId, threads[i].id, role).run()
    }

    written.push({
      id: clusterId, name: s.name, thread_count: threads.length,
      vlog_count: vlogIds.size, named_by_system: !!s.named_by_system,
    })
  }

  return {
    ok: true,
    topic_keys_considered: topicKeys.length,
    subjects_proposed: llmSubjects.length,
    subjects_written: written.length,
    subjects: written,
    model: LLAMA_70B,
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

function firstQuote(keyQuotesJson: string | null): string {
  if (!keyQuotesJson) return ''
  try {
    const arr = JSON.parse(keyQuotesJson)
    if (Array.isArray(arr) && arr.length > 0) return String(arr[0] ?? '')
  } catch {
    // Not JSON — treat as a plain string.
    return keyQuotesJson
  }
  return ''
}

function clamp01(n: unknown): number {
  const v = typeof n === 'number' ? n : 0.5
  return Math.max(0, Math.min(1, v))
}

function parseSubjectsJson(text: string): LlmSubject[] {
  let t = text.trim()
  if (t.startsWith('```json')) t = t.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  else if (t.startsWith('```')) t = t.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  // Some models prepend prose — grab the first {...} block.
  const firstBrace = t.indexOf('{')
  const lastBrace = t.lastIndexOf('}')
  if (firstBrace > 0 && lastBrace > firstBrace) t = t.slice(firstBrace, lastBrace + 1)
  const obj = JSON.parse(t)
  const subjects = Array.isArray(obj?.subjects) ? obj.subjects : []
  return subjects
    .filter((s: any) => s && typeof s.name === 'string' && Array.isArray(s.member_indexes))
    .map((s: any) => ({
      name: String(s.name).trim(),
      framing: String(s.framing ?? '').trim(),
      named_by_system: s.named_by_system === true,
      confidence: typeof s.confidence === 'number' ? s.confidence : 0.5,
      member_indexes: s.member_indexes.filter((i: any) => Number.isInteger(i)),
    }))
}
