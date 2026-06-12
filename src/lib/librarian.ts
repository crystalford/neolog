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
const MAX_TOPIC_KEYS = 200
// Minimum threads for a SUBJECT_KIND='theme' subject (the recurring kind).
// A sharp one-off is a different kind ('candidate') — see PHASE-5b sharpening.
const MIN_THREADS_PER_SUBJECT = 2
// How many of the strongest takes we send to the model with their VERBATIM
// transcript spans. The librarian's prior bug: it saw only aggregated
// summaries-of-summaries. Now it sees primary material for the strongest
// material, which lets it do "you keep describing X — that's actually Y."
const VERBATIM_ANCHOR_SAMPLES = 25
// Per-anchor verbatim length cap (chars). Tight enough to keep the prompt
// under ~6k tokens; long enough to carry the actual mechanism of the take.
const VERBATIM_ANCHOR_CHARS = 600

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

const SYSTEM_PROMPT = `You are a CONCEPT-NAMING engine. The creator records themselves thinking out loud; other systems already tagged the surface topics. Your job is harder: behind the topics, find the actual recurring IDEAS — and NAME them precisely. The creator wants the *aha* moment of hearing "what you're circling is actually <X>" — not a wellness-blog category they already knew.

You are reading TWO things together:
  · A list of topic-keys with thread/vlog counts (the breadth signal).
  · A short set of VERBATIM SPANS — the creator's actual spoken words from the strongest takes. These are primary material; they're where the *mechanism* of the idea lives. Read them carefully. The names you propose must reflect what is actually said, not the generic topic-label.

═══════════════════════════════════════════════════════════════
HARD RULES — non-negotiable. Failures here ruin the output.
═══════════════════════════════════════════════════════════════

1. PUSH ALL THE WAY TO THE NAMED CONCEPT. Not the life-area. Not the topic-label. The MECHANISM. Read the verbatim spans; if the creator is describing a phenomenon that already HAS a name in any real field (psychology, economics, philosophy, politics, sociology, technology, design, biology, anthropology, sport psychology, religion, military strategy) — NAME IT. That's the unlock. ("You're circling the principal-agent problem." "That's loss aversion." "That's the streetlight effect." "That's epistemic learned helplessness." "That's the optimizer's curse." "That's Goodhart's law." "That's the bystander effect.")

2. GENERIC CATEGORY HEADERS ARE FAILURES. The following classes of output are REJECTED:
   · life-area labels: "Personal Growth", "Mental Health", "Emotional Regulation", "Time Management", "Productivity", "Creative Process", "Career Development", "Content Creation", "AI and Technology", "Mindfulness", "Self-Care", "Wellness", "Work-Life Balance", "Relationships", "Communication"
   · vague concatenations: anything joined by "and" that names two domains ("X and Y")
   · YouTube-tier umbrella tags: anything that could be a content-platform category
   These are NOT acceptable. If the verbatim spans only support a category like this, OMIT the subject rather than ship it. Fewer real subjects beat eight categories.

3. EVERY name must be one of:
   (a) A real term-of-art that exists in a field (set named_by_system=true). The verbatim spans should clearly describe the phenomenon without the creator using the term itself.
   (b) A sharp 3–7 word coinage that captures the SPECIFIC angle (set named_by_system=false). Not the general domain; the actual mechanism. "procrastination as information", "the latency tax on AI trust", "audience as compass", "the felt sense before the thought", "the burden of the chosen one", "delegating the work that defines you."

4. named_by_system rules (strict):
   true ONLY when: the name is a recognized term-of-art AND the creator was clearly describing it WITHOUT using the term in the verbatim spans.
   false: when you coined the phrase. When the creator already named it. When you're not sure.

5. FRAMING is second person, specific, drawn from the verbatim. Shape: "You keep circling this: <the specific mechanism or tension>, <when/where it shows up in your thinking>." Bad: "You keep circling personal growth." Good: "You keep circling whether discipline is upstream or downstream of identity — it comes up every time you talk about your routines, and you flip on it across recordings."

6. SHARP ONE-OFFS ARE ALLOWED. If one verbatim span contains a single, genuinely sharp framing that has not recurred yet, you may emit it as a subject — but set confidence ≤ 0.6 so the UI can sort it as a candidate, not a confirmed recurring subject. Set member_indexes to that single entry. Do NOT do this for generic categories — only for sharp specific naming.

7. AIM for 5–10 subjects of REAL QUALITY. Fewer is better than padded. An empty subjects list is acceptable if you literally cannot find anything sharp; that signal beats slop.

8. RETURN ONLY VALID JSON. No prose, no markdown, no commentary.

═══════════════════════════════════════════════════════════════
EXAMPLES (study these — the GOOD ones are the bar)
═══════════════════════════════════════════════════════════════

VERBATIM input:
  "every time my agent says he's working for me, the deals he brings back are the ones that make HIM look good to his boss not me. the incentive isn't aligned. it's like, his quarter has to look good, that's the actual metric."

BAD (reject): {"name":"Career Development and Entrepreneurship"} ← life-area, useless.
BAD (reject): {"name":"Working with agents"} ← topic-label, no concept.
GOOD: {"name":"the principal-agent problem","framing":"You keep circling this: how someone hired to act for you ends up serving their own metric instead — managers, agents, executives, anyone whose quarter has to look good.","named_by_system":true,"confidence":0.85}

VERBATIM input:
  "I waited like 30 seconds and I was already not trusting the answer. it's like the lag itself teaches you to expect garbage. by the third time I just stopped asking."

BAD: {"name":"AI and Technology"} ← REJECTED.
GOOD: {"name":"the latency tax on AI trust","framing":"You keep circling this: how long waits on AI answers erode your willingness to use the tool — the lag itself teaches you to expect garbage.","named_by_system":false,"confidence":0.8}

VERBATIM input (a single sharp one-off):
  "I felt this thing in my body before I had any words for what it was. the felt sense was already deciding before my head was thinking about it."

BAD: {"name":"Emotional Regulation"} ← REJECTED.
GOOD: {"name":"the felt sense before the thought","framing":"You named this once, sharply: your body deciding before your head has words for it. Worth pulling on.","named_by_system":false,"confidence":0.55}

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

  // ── 2. Pull VERBATIM SPANS for the strongest takes ─────────────────────
  // The librarian's prior failure mode: it saw aggregated summaries-of-
  // summaries (one rep-take per topic-key) and rounded to blog categories.
  // Now it also sees the actual spoken words for the N strongest moments
  // across the corpus — primary material from which "you keep describing
  // X — that's actually Y" can be drawn.
  const anchorRes = await db.prepare(
    `SELECT t.id, t.vlog_id, t.take,
            t.transcript_span_start AS span_start,
            t.transcript_span_end   AS span_end,
            COALESCE(NULLIF(TRIM(t.abstracted_topic), ''), t.topic) AS subject_key,
            COALESCE(t.strength, 3) AS strength
       FROM threads t
      WHERE t.operator_id = ? AND t.deleted_at IS NULL
        AND t.take IS NOT NULL AND length(t.take) > 60
        AND NOT EXISTS (SELECT 1 FROM extraction_runs er WHERE er.id = t.run_id AND er.is_active = 0)
      ORDER BY strength DESC, length(t.take) DESC
      LIMIT ?`,
  ).bind(operatorId, VERBATIM_ANCHOR_SAMPLES).all<{
    id: string; vlog_id: string; take: string | null; span_start: number | null
    span_end: number | null; subject_key: string; strength: number
  }>()
  const anchors = anchorRes.results ?? []
  const verbatimByAnchor = new Map<string, string>()
  for (const a of anchors) {
    if (a.span_start == null || a.span_end == null) continue
    const wordRows = await db.prepare(
      `SELECT word FROM transcript_words
        WHERE vlog_id = ? AND start_time >= ? AND end_time <= ?
        ORDER BY word_index ASC LIMIT 200`,
    ).bind(a.vlog_id, a.span_start, a.span_end).all<{ word: string }>()
    const words = wordRows.results ?? []
    if (words.length > 0) {
      verbatimByAnchor.set(a.id, words.map(w => w.word).join(' ').slice(0, VERBATIM_ANCHOR_CHARS))
    }
  }

  // ── 3. Ask the librarian to organize + name ────────────────────────────
  const inputList = topicKeys.map((t, i) =>
    `${i}. "${t.key}" — ${t.thread_count} thread${t.thread_count === 1 ? '' : 's'}/${t.vlog_count} vlog${t.vlog_count === 1 ? '' : 's'}` +
    (t.sample_take ? ` — e.g. "${t.sample_take.replace(/\s+/g, ' ').trim()}"` : ''),
  ).join('\n')
  const verbatimBlock = anchors.length === 0 ? '' :
    `\n\nVERBATIM SPANS — the creator's actual spoken words on their strongest takes. Use these to find the underlying MECHANISM behind each topic-key. The named concept comes from what's literally being described here, not from the topic label.\n\n` +
    anchors.map((a, i) => {
      const span = verbatimByAnchor.get(a.id)
      const text = (span || a.take || '').replace(/\s+/g, ' ').trim()
      return `[A${i}] under "${a.subject_key}" — "${text.slice(0, VERBATIM_ANCHOR_CHARS)}"`
    }).join('\n')

  const userPrompt = `Topic-entries (most frequent first). Each line: index. "topic" — counts — example summary.\n\n${inputList}${verbatimBlock}\n\nFind the named concepts behind these. Push all the way to the mechanism — generic categories are REJECTED. Sharp one-offs are allowed with confidence ≤ 0.6. Return ONLY the JSON.`

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
    // Recurrence floor for normal recurring subjects. Sharp one-offs are
    // allowed through when the model marked them with confidence ≤ 0.6
    // (the "I can name this even though it appeared once" path). They get
    // a different subject_kind ('candidate') so the UI can distinguish.
    const isSharpOneOff = threads.length === 1 && s.confidence > 0 && s.confidence <= 0.6
    if (threads.length < MIN_THREADS_PER_SUBJECT && !isSharpOneOff) continue

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
    const subjectKind = isSharpOneOff ? 'candidate' : 'theme'
    await db.prepare(
      `INSERT INTO clusters
         (id, operator_id, topic, take, abstracted_topic, state, ripeness_score,
          framing, concept_confidence, named_by_system, representative_quote,
          subject_source, subject_kind)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 'librarian', ?)`,
    ).bind(
      clusterId, operatorId,
      s.name.slice(0, 200),
      s.name.toLowerCase().slice(0, 200),
      state, ripeness,
      (s.framing ?? '').slice(0, 500),
      clamp01(s.confidence),
      s.named_by_system ? 1 : 0,
      repQuote.slice(0, 500),
      subjectKind,
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

  // Auto-rebuild the operator profile after every librarian pass — the
  // graph just changed; the "knows me" layer should reflect it.
  try {
    const { rebuildOperatorProfile } = await import('./operator-profile')
    await rebuildOperatorProfile(db, operatorId, env)
  } catch (err: any) {
    console.warn(`[librarian] profile rebuild failed: ${err?.message || err}`)
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
