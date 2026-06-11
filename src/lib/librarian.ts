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
import { callReasoning, MODELS, type ReasoningEnv } from './models'
import type { D1Database } from '@cloudflare/workers-types'

const MODELS_HARD_ID = MODELS.HARD

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

const SYSTEM_PROMPT = `You are a sharp editor identifying the SPECIFIC IDEAS a creator keeps returning to in their recordings. Not categories — ideas. Not topics — claims, mechanisms, tensions, named concepts.

The creator records themselves thinking out loud. Other systems have already tagged their topics. Your job is harder: behind the topics, find the actual recurring IDEAS — and NAME them precisely.

═══════════════════════════════════════════════════════════════
HARD RULES — read these. The grade comes from how well you follow them.
═══════════════════════════════════════════════════════════════

1. PUSH for the SPECIFIC mechanism, not the general life-area. Broad categories ARE acceptable as fallback when no sharper concept is actually present, but always try for the sharper name first. "Procrastination as information" beats "Time Management and Productivity." "The latency tax on AI trust" beats "AI and Technology." When the creator's recurring moments really are just generic life themes, fine — name them — but don't pad weak material with generic headers.

2. EVERY name should aspire to one of:
   (a) A specific term-of-art that exists in a real field — psychology, economics, philosophy, politics, sociology, technology, design, biology, anthropology. Examples: "the principal-agent problem", "loss aversion", "theory of mind", "rent-seeking", "the bystander effect", "moral licensing", "Goodhart's law", "the optimizer's curse", "epistemic learned helplessness", "Chesterton's fence", "the streetlight effect", "phenomenological reduction".
   (b) A sharp 3-7 word coinage that captures the SPECIFIC angle the creator takes — not the general domain. Examples: "procrastination as information", "the latency tax on AI trust", "audience as compass", "the felt sense before the thought".

3. If your candidate name could fit on Oprah's website AND a sharper concept is actually present in the material, the sharper one wins. Only fall back to the generic category when the sharper concept genuinely isn't there.

4. named_by_system is true ONLY when:
   - The name is a real term-of-art (existed in the world before the creator)
   - AND the creator was clearly describing the phenomenon WITHOUT using the term
   - It is FALSE when you coined a fresh phrase. It is FALSE when the creator was already using a name close to yours.
   - Default: false. Only set true when you're confident you taught them a real word for something.

5. For each subject, write a one-line FRAMING (second person): "You keep circling this: <the specific claim or tension>, <when it shows up>." The framing must be specific. "You keep circling personal growth" is wrong. "You keep circling whether discipline is upstream or downstream of identity, mostly when you talk about your routines" is right.

6. Aim for 6–12 subjects. Fewer is better than padded. If something is genuinely a one-off, don't force it in. If two of your subjects feel like the same thing wearing different hats, merge them.

7. RETURN ONLY VALID JSON. No prose. No markdown fences. No commentary.

═══════════════════════════════════════════════════════════════
EXAMPLES
═══════════════════════════════════════════════════════════════

BAD (do not do this):
{"name":"Time Management and Productivity","framing":"You keep circling this: finding ways to manage your time effectively and overcome procrastination.","named_by_system":true,...}

GOOD (do this):
{"name":"procrastination as information","framing":"You keep circling this: the suspicion that what you put off is telling you something — that the resistance itself is data, not a flaw to crush.","named_by_system":false,...}

BAD:
{"name":"AI and Technology","framing":"You keep circling this: the potential and limitations of artificial intelligence...","named_by_system":true,...}

GOOD:
{"name":"the latency tax on AI trust","framing":"You keep circling this: how long-running AI calls erode your willingness to use the tool, even when the answers are good — the wait teaches you not to ask.","named_by_system":false,...}

GOOD (term-of-art naming):
{"name":"the principal-agent problem","framing":"You keep circling this: when someone hired to act for you ends up serving themselves instead — managers, executives, anyone whose incentives quietly diverge from the people they're supposed to represent.","named_by_system":true,...}

═══════════════════════════════════════════════════════════════
OUTPUT SHAPE
═══════════════════════════════════════════════════════════════

Return ONLY this JSON:
{"subjects":[{"name":"...","framing":"...","named_by_system":false,"confidence":0.0,"member_indexes":[0,1]}]}`

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
    return { ok: true, topic_keys_considered: 0, subjects_proposed: 0, subjects_written: 0, subjects: [], model: MODELS_HARD_ID }
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

  // Concept-naming is the hardest-reasoning task in the system → high effort
  // on gpt-oss-120b, with automatic Llama 70B fallback (see src/lib/models.ts).
  let llmSubjects: LlmSubject[]
  let modelUsed: string = MODELS_HARD_ID
  try {
    const res = await callReasoning(env, {
      system: SYSTEM_PROMPT,
      user: userPrompt,
      effort: 'high',
      maxTokens: 4096,
    })
    modelUsed = res.fellBack ? `${res.model} (fallback)` : res.model
    llmSubjects = parseSubjectsJson(res.text)
  } catch (err: any) {
    return {
      ok: false, topic_keys_considered: topicKeys.length, subjects_proposed: 0,
      subjects_written: 0, subjects: [], model: modelUsed,
      error: `librarian LLM failed: ${err?.message || err}`.slice(0, 500),
    }
  }

  // Operator's stance: broad categories AND sharp concepts both have value.
  // No name filter — but we still tighten `named_by_system` so the badge
  // doesn't mass-fire on generic category headers.
  const acceptedSubjects = llmSubjects.map(s => ({
    ...s,
    named_by_system: looksLikeRealTermOfArt(s.name) ? s.named_by_system : false,
  }))

  // ── 3. Resolve each subject's member threads ───────────────────────────
  // Clear prior librarian subjects (cluster_threads cascades on cluster delete).
  await db.prepare(
    `DELETE FROM clusters WHERE operator_id = ? AND subject_source = 'librarian'`,
  ).bind(operatorId).run()

  const written: BuildSubjectsResult['subjects'] = []

  for (const s of acceptedSubjects) {
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
    // Meaning over frequency (canopticon Part 17): a sharp, high-confidence
    // idea said a few times can matter more than a generic theme said often.
    // Compute a frequency-based base, then scale by the model's confidence so
    // conviction — not raw repetition — drives the ranking. A recurrence floor
    // (MIN_THREADS_PER_SUBJECT) still applies above; this only orders what's
    // already passed it.
    const freqBase = threads.length * 12 + (vlogIds.size - 1) * 8 + avgStrength * 3
    const confidence = clamp01(s.confidence)
    const ripeness = Math.min(100, Math.round(freqBase * (0.6 + 0.4 * confidence)))
    const repQuote = firstQuote(threads[0]?.key_quotes) || (threads[0]?.take ?? '').slice(0, 200)
    const state = ripeness >= 60 ? 'ready' : 'forming'

    const clusterId = ulid()
    // IMPORTANT: do NOT write framing into the `take` column. The production
    // generator reads `take` as voice-anchor material and will regurgitate
    // "You keep circling this:" into a spoken script (we saw that exact
    // bug). framing belongs only on the `framing` column for the UI; the
    // operator's own voice never lived there.
    await db.prepare(
      `INSERT INTO clusters
         (id, operator_id, topic, take, abstracted_topic, state, ripeness_score,
          framing, concept_confidence, named_by_system, representative_quote,
          subject_source, subject_kind)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'librarian', 'theme')`,
    ).bind(
      clusterId, operatorId,
      s.name.slice(0, 200),
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

  // ── Phase 3: tensions, evolution, open-loops ───────────────────────────
  // After themes are written, fire a second model pass to find the alive
  // part of the corpus: contradictions across time (tension), changes-of-
  // mind (evolution), and unresolved questions the operator keeps returning
  // to (open_loop). These get their own subjects and sort to the TOP of
  // the screen — they're the sharpest essay seeds.
  try {
    const tensionSubjects = await detectTensionsAndLoops(db, operatorId, env)
    for (const t of tensionSubjects) {
      written.push(t)
    }
  } catch (err: any) {
    console.warn(`[librarian] tension pass failed: ${err?.message || err}`)
  }

  return {
    ok: true,
    topic_keys_considered: topicKeys.length,
    subjects_proposed: llmSubjects.length,
    subjects_written: written.length,
    subjects: written,
    model: modelUsed,
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

// Tightens the "named for you" badge — the librarian shouldn't claim it
// taught the operator a word for "Personal Growth." A real term-of-art:
// either has a "the X" / "X's law" / "Y effect" / "Z paradox" / "W
// problem" shape, OR is a recognizable concept word that's unlikely to
// be a generic category header. Conservative on purpose — false negative
// (badge missing) is much better than false positive (badge spammed).
function looksLikeRealTermOfArt(name: string): boolean {
  const n = name.trim().toLowerCase()
  if (n.length < 4) return false
  const technicalShape = /\b(the\s+\w+(?:[-\s]\w+)?(?:\s+(problem|paradox|effect|fallacy|law|principle|theorem|curse|tax|loop|trap)))\b/.test(n)
    || /\b(\w+'s\s+(law|principle|razor|paradox|curse|wager))\b/.test(n)
    || /\b(principal[-\s]agent|theory\s+of\s+mind|bystander\s+effect|loss\s+aversion|rent[-\s]seeking|moral\s+licensing|goodhart|chesterton|epistemic|optimizer)/.test(n)
  if (technicalShape) return true
  // Multi-word generic category headers like "Personal Growth" — not a term.
  const genericCategorySignal = /^(personal|emotional|mental|creative|career|content|business|self|time|work|life|social|digital|spiritual|professional)\s+(growth|health|wellness|management|development|process|creation|strategy|doubt|care|inspiration|regulation|distribution|productivity|balance|setting|automation|criticism)/
  if (genericCategorySignal.test(n)) return false
  // Single concrete noun ("attention", "delegation") is too generic for the badge.
  if (!/\s/.test(n)) return false
  return false
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

// ─── Phase 3: tensions / evolution / open-loops ──────────────────────────

const TENSION_SYSTEM_PROMPT = `You are reading a creator's spoken recordings to surface the ALIVE part of their thinking: the contradictions, changes-of-mind, and unresolved questions they keep circling. These are the sharpest material for a video essay — far sharper than a flat recurring theme.

You receive a list of MOMENTS (the operator's most substantive recent takes) with date + kind + take text. Find:

1. TENSION — two moments where the operator took OPPOSING positions on the same idea. Different dates. Same underlying topic. Example: on May 12 "discipline comes first," on June 2 "discipline is downstream of identity." Surface ALL real ones; don't force fake ones.

2. EVOLUTION — a directional shift: the operator's view on a topic MATURED or moved in one direction over time. Not a flat contradiction; a development. Example: early takes are exploratory, later takes are confident.

3. OPEN_LOOP — a question the operator keeps RETURNING to but has not resolved. Look for kind=open_question moments, "I don't know," "I'm not sure what I'm trying to get at," and questions that recur across dates without an answer.

For each finding, output:
{
  "kind": "tension" | "evolution" | "open_loop",
  "name": "<a sharp 4-10 word label for this finding>",
  "framing": "<one second-person sentence: 'You keep circling this:' or 'You changed your mind:' or 'You haven't answered this:' followed by the specifics>",
  "pole_a": "<for tension/evolution: the earlier position, ≤ 200 chars, voice-flavored>",
  "pole_b": "<for tension/evolution: the later position, ≤ 200 chars, voice-flavored>",
  "pole_a_index": <integer index of the moment for pole_a>,
  "pole_b_index": <integer index of the moment for pole_b>,
  "supporting_indexes": [<integers>, ...] // any other moments that belong to this finding
}

For open_loop: pole_a/pole_b can be empty; pole_a_index points at the strongest example moment.

Aim for 2–6 findings total across all three kinds. Quality over volume. If you can't find any, return findings: []. Don't invent.

Return ONLY this JSON:
{"findings":[ ... ]}`

interface TensionFinding {
  kind: 'tension' | 'evolution' | 'open_loop'
  name: string
  framing: string
  pole_a: string
  pole_b: string
  pole_a_index: number
  pole_b_index: number
  supporting_indexes: number[]
}

async function detectTensionsAndLoops(
  db: D1Database,
  operatorId: string,
  env: ReasoningEnv,
): Promise<BuildSubjectsResult['subjects']> {
  // Pull the operator's substantive takes — strongest first, capped to fit
  // the model. Include the kind + vlog recorded_at so the model can reason
  // about ordering.
  const rows = await db.prepare(
    `SELECT t.id        AS thread_id,
            t.vlog_id   AS vlog_id,
            t.take      AS take,
            t.utterance_kind AS kind,
            v.recorded_at AS recorded_at
       FROM threads t
       JOIN vlogs   v ON v.id = t.vlog_id
      WHERE t.operator_id = ? AND t.deleted_at IS NULL
        AND t.take IS NOT NULL AND length(t.take) > 40
      ORDER BY COALESCE(t.strength, 3) DESC, v.recorded_at DESC
      LIMIT 80`,
  ).bind(operatorId).all<{
    thread_id: string; vlog_id: string; take: string | null; kind: string | null; recorded_at: string | null
  }>()

  const moments = (rows.results ?? [])
    .filter(r => (r.take ?? '').trim().length > 0)
    .slice(0, 80)
  if (moments.length < 6) return []

  // Sort by date asc so position-in-list ≈ position-in-time — helps the
  // model find directional evolution.
  moments.sort((a, b) => String(a.recorded_at ?? '').localeCompare(String(b.recorded_at ?? '')))

  const inputList = moments.map((m, i) =>
    `${i}. [${m.recorded_at ?? '?'} · ${m.kind ?? 'observation'}] ${(m.take ?? '').replace(/\s+/g, ' ').slice(0, 280)}`,
  ).join('\n')

  const userPrompt = `Here are the operator's substantive moments, oldest first. Index. [date · kind] take.\n\n${inputList}\n\nFind tensions, evolutions, and open loops as specified. Return ONLY the JSON.`

  let findings: TensionFinding[] = []
  try {
    const r = await callReasoning(env, {
      system: TENSION_SYSTEM_PROMPT,
      user: userPrompt,
      effort: 'high',
      maxTokens: 4096,
    })
    findings = parseTensionsJson(r.text)
  } catch (err: any) {
    console.warn(`[detectTensionsAndLoops] LLM failed: ${err?.message || err}`)
    return []
  }

  const written: BuildSubjectsResult['subjects'] = []
  for (const f of findings) {
    const memberIdxs = Array.from(new Set([
      ...(Number.isInteger(f.pole_a_index) ? [f.pole_a_index] : []),
      ...(Number.isInteger(f.pole_b_index) ? [f.pole_b_index] : []),
      ...(Array.isArray(f.supporting_indexes) ? f.supporting_indexes : []),
    ])).filter(i => i >= 0 && i < moments.length)
    if (memberIdxs.length === 0) continue

    const memberMoments = memberIdxs.map(i => moments[i])
    const vlogSet = new Set(memberMoments.map(m => m.vlog_id))
    const poleAAt = Number.isInteger(f.pole_a_index) ? moments[f.pole_a_index]?.recorded_at ?? null : null
    const poleBAt = Number.isInteger(f.pole_b_index) ? moments[f.pole_b_index]?.recorded_at ?? null : null

    // Tensions/evolutions are sharper than themes — boost ripeness so they
    // sort to the top of the Subjects screen.
    const baseRipeness = Math.min(100, 50 + memberMoments.length * 6 + (vlogSet.size - 1) * 5)
    const ripeness = f.kind === 'open_loop' ? Math.min(100, baseRipeness - 5) : Math.min(100, baseRipeness + 10)

    const clusterId = ulid()
    await db.prepare(
      `INSERT INTO clusters
         (id, operator_id, topic, take, abstracted_topic, state, ripeness_score,
          framing, concept_confidence, named_by_system, representative_quote,
          subject_source, subject_kind, pole_a, pole_b, pole_a_at, pole_b_at)
       VALUES (?, ?, NULL, ?, ?, 'ready', ?, ?, ?, 0, ?, 'librarian', ?, ?, ?, ?, ?)`,
    ).bind(
      clusterId, operatorId,
      f.name.slice(0, 200),
      f.name.toLowerCase().slice(0, 200),
      ripeness,
      f.framing.slice(0, 500),
      0.8,
      (memberMoments[0]?.take ?? '').slice(0, 500),
      f.kind,
      (f.pole_a ?? '').slice(0, 500),
      (f.pole_b ?? '').slice(0, 500),
      poleAAt,
      poleBAt,
    ).run()

    for (const m of memberMoments) {
      await db.prepare(
        `INSERT OR IGNORE INTO cluster_threads (cluster_id, thread_id, role) VALUES (?, ?, 'core')`,
      ).bind(clusterId, m.thread_id).run()
    }
    written.push({
      id: clusterId,
      name: `${f.kind === 'tension' ? '⚡' : f.kind === 'evolution' ? '↗' : '?'} ${f.name}`,
      thread_count: memberMoments.length,
      vlog_count: vlogSet.size,
      named_by_system: false,
    })
  }
  return written
}

function parseTensionsJson(text: string): TensionFinding[] {
  let t = text.trim()
  if (t.startsWith('```json')) t = t.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
  else if (t.startsWith('```')) t = t.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
  const firstBrace = t.indexOf('{')
  const lastBrace = t.lastIndexOf('}')
  if (firstBrace > 0 && lastBrace > firstBrace) t = t.slice(firstBrace, lastBrace + 1)
  const obj = JSON.parse(t)
  const findings = Array.isArray(obj?.findings) ? obj.findings : []
  return findings
    .filter((f: any) => f && ['tension','evolution','open_loop'].includes(f.kind) && typeof f.name === 'string')
    .map((f: any) => ({
      kind: f.kind,
      name: String(f.name).trim(),
      framing: String(f.framing ?? '').trim(),
      pole_a: String(f.pole_a ?? '').trim(),
      pole_b: String(f.pole_b ?? '').trim(),
      pole_a_index: Number.isInteger(f.pole_a_index) ? f.pole_a_index : -1,
      pole_b_index: Number.isInteger(f.pole_b_index) ? f.pole_b_index : -1,
      supporting_indexes: Array.isArray(f.supporting_indexes) ? f.supporting_indexes.filter((n: any) => Number.isInteger(n)) : [],
    }))
}
